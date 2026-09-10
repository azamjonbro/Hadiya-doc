// BLOK 10 — AI generation: the job lifecycle, the source readers, the
// budget, and what must not leave the building.
//
// **There is no API key in development**, and there is none on the server
// either — so the model call is injected. That is not a shortcut around
// testing the interesting part: everything that can be wrong here without
// the model being involved is right here.
//
//   - a generated course must land as a **draft**, all the way down. A
//     first draft written by something that has never met the company gets
//     the structure right and the specifics wrong, and an author who has to
//     unpublish a wrong course learns not to use the feature.
//   - the model's HTML goes through the **same sanitiser** a hand-written
//     lesson does. "It came from Claude" is not a trust boundary.
//   - personal data is **redacted before the prompt is built**. An HR
//     "safety briefing" export routinely carries the attendance list, and
//     an attendance list here means JSHSHIRs.
//   - a refusal, a truncated answer and a job delivered twice are all
//     normal outcomes, and none of them may leave a half-built course or
//     charge twice.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import JSZip from 'jszip'
import PDFDocument from 'pdfkit'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Lesson } from '../src/models/lesson.model.js'
import { Settings } from '../src/models/settings.model.js'
import { AiGenerationJob } from '../src/models/aiGenerationJob.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { redactPii, PII_RULE_NAMES } from '../src/services/ai/piiRedact.js'
import { extractSourceText } from '../src/services/ai/sourceExtract.service.js'
import { aiGenerationService } from '../src/services/ai/aiGeneration.service.js'
import { topicSourceText, AI_QUIZ_TYPES } from '../src/services/ai/aiQuiz.service.js'
import { aiTranslateService, collectStrings } from '../src/services/ai/aiTranslate.service.js'
import { ContentTranslation } from '../src/models/contentTranslation.model.js'
import { lessonService } from '../src/services/courses/lesson.service.js'
import { Question } from '../src/models/question.model.js'
import { QuestionBank } from '../src/models/questionBank.model.js'
import { aiBudgetService } from '../src/services/ai/aiBudget.service.js'
import { settingsService } from '../src/services/settings/settings.service.js'
import { PAYLOAD_SCHEMAS } from '../src/validators/question.validator.js'
import { aiGenerationQueue } from '../src/jobs/aiGenerationQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let author
const userIds = []
const courseIds = []
const jobIds = []
const bankIds = []
const translatedIds = []

const actor = () => ({ id: author._id.toString(), permissions: ['course:create', 'course:update'] })

/** What the model would have returned, in the shape the schema describes. */
const OUTLINE = {
  title: `Mehnat xavfsizligi ${stamp}`,
  description: 'Ishga kirishdan oldin bilish shart bo\'lgan qoidalar',
  topics: [
    {
      title: 'Kirish',
      description: 'Umumiy qoidalar',
      lessons: [
        {
          title: 'Himoya kiyimi',
          estimatedMinutes: 7,
          blocks: [
            { type: 'HEADING', text: 'Himoya kiyimi', level: 2 },
            // The model's HTML, with something the sanitiser has to remove.
            {
              type: 'TEXT',
              text: '<p onclick="steal()">Kiyimni <strong>har smena</strong> boshida tekshiring.<script>alert(1)</script></p>',
            },
            { type: 'CALLOUT', text: '<p>Nosoz asbob bilan ishlash taqiqlanadi.</p>', variant: 'DANGER' },
            { type: 'TABLE', rows: [['Bosqich', 'Mas\'ul'], ['Tekshiruv', 'Brigadir']], hasHeader: true },
          ],
        },
        {
          title: 'Jurnal',
          blocks: [{ type: 'TEXT', text: '<p>Yakunda jurnalga qo\'l qo\'yiladi.</p>' }],
        },
      ],
    },
  ],
}

const stubGenerate = (outline = OUTLINE, usage = {}) =>
  async () => ({
    data: outline,
    usage: { model: 'claude-opus-5', inputTokens: 1200, outputTokens: 800, cacheReadTokens: 0, ...usage },
  })

async function makeUser() {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  const user = await User.create({
    firstName: 'AI',
    lastName: 'Muallif',
    fullName: 'AI Muallif',
    jshshir: `21${stamp}001`,
    passwordHash: await hashPassword('AiTest123!'),
    roleId: role._id,
  })
  userIds.push(user._id)
  return user
}

/** Runs a job to completion with the model stubbed. */
async function runJob(params, deps) {
  const job = await aiGenerationService.create(actor(), { type: 'COURSE_OUTLINE', params })
  jobIds.push(new mongoose.Types.ObjectId(job.id))
  await aiGenerationService.run(job.id, deps)
  const finished = await AiGenerationJob.findById(job.id).lean()
  if (finished.result?.courseId) courseIds.push(new mongoose.Types.ObjectId(finished.result.courseId))
  return finished
}

describe('BLOK 10 · AI generation', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')
    author = await makeUser()
    // A clean budget: other suites may have left jobs in this month.
    await Settings.updateOne({ _id: 'global' }, { $set: { 'ai.monthlyTokenBudget': 0, 'ai.generationEnabled': true } }, { upsert: true })
    await settingsService.invalidate?.()
  })

  after(async () => {
    await ContentTranslation.deleteMany({ entityId: { $in: [...courseIds, ...translatedIds] } })
    await Question.deleteMany({ bankId: { $in: bankIds } })
    await QuestionBank.deleteMany({ _id: { $in: bankIds } })
    await AiGenerationJob.deleteMany({ requestedBy: { $in: userIds } })
    await Lesson.deleteMany({ courseId: { $in: courseIds } })
    await Topic.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await Settings.updateOne({ _id: 'global' }, { $set: { 'ai.monthlyTokenBudget': 0, 'ai.generationEnabled': true } })
    await aiGenerationQueue.obliterate({ force: true }).catch(() => {})
    await aiGenerationQueue.close()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('what must not leave the building (10.6)', () => {
    test('identifiers are replaced, and the sentence still reads', () => {
      const source = [
        'Ishtirokchilar: Aliyev A. (JSHSHIR 12345678901234), tel +998 90 123-45-67,',
        'aliyev@example.com, pasport AB1234567, hisob 40817810099910004312.',
      ].join('\n')
      const { text, redactions, total } = redactPii(source)

      assert.doesNotMatch(text, /12345678901234/)
      assert.doesNotMatch(text, /aliyev@example\.com/)
      assert.doesNotMatch(text, /AB1234567/)
      assert.doesNotMatch(text, /40817810099910004312/)
      assert.match(text, /\[JSHSHIR\]/)
      assert.match(text, /\[EMAIL\]/)
      // A placeholder rather than a deletion: the model still sees a
      // sentence about a participant.
      assert.match(text, /Ishtirokchilar: Aliyev A\./)
      assert.ok(total >= 5, `expected every identifier redacted, got ${JSON.stringify(redactions)}`)
    })

    test('every rule is wired in, not merely written', () => {
      // A rule added to the list and never reached is the failure this
      // catches: each one has to actually fire on its own example.
      const samples = {
        jshshir: '12345678901234',
        passport: 'AB1234567',
        account: '40817810099910004312',
        email: 'a@b.uz',
        phone: '901234567',
      }
      for (const name of PII_RULE_NAMES) {
        const { redactions } = redactPii(samples[name])
        assert.ok(redactions[name] >= 1, `${name} did not fire on ${samples[name]}`)
      }
    })

    test('ordinary course text is left alone', () => {
      // Over-redaction is its own failure: a course about the 2026 plan
      // should not come out as a course about the [NUMBER] plan.
      const { text, total } = redactPii('2026 yilda 15 kishi 3 kunlik o\'quvda qatnashdi.')
      assert.equal(total, 0)
      assert.match(text, /2026 yilda 15 kishi/)
    })

    test('the redaction runs before the prompt, and the job records it', async () => {
      let promptSeen = ''
      const finished = await runJob(
        { sourceText: 'Xodim 12345678901234 himoya kiyimini oldi.', lang: 'Uzbek' },
        {
          generate: async ({ prompt }) => {
            promptSeen = prompt
            return {
              data: OUTLINE,
              usage: { model: 'claude-opus-5', inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 },
            }
          },
        }
      )
      // The identifier never reaches the string that would have been sent.
      assert.doesNotMatch(promptSeen, /12345678901234/)
      assert.match(promptSeen, /\[JSHSHIR\]/)
      assert.equal(finished.result.redactions.jshshir, 1)
    })
  })

  describe('reading a source document (10.2)', () => {
    test('a docx becomes paragraphs', async () => {
      const zip = new JSZip()
      zip.file(
        'word/document.xml',
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          '<w:p><w:r><w:t>Birinchi band</w:t></w:r></w:p><w:p><w:r><w:t>Ikkinchi band</w:t></w:r></w:p>' +
          '</w:body></w:document>'
      )
      zip.file(
        '[Content_Types].xml',
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
      )
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      const extracted = await extractSourceText(buffer, { ext: 'docx' })
      assert.equal(extracted.blocks, 2)
      assert.match(extracted.text, /Birinchi band\nIkkinchi band/)
    })

    test('a pptx keeps slide order, including past slide 9', async () => {
      const slide = (text) =>
        '<?xml version="1.0"?><p:sld xmlns:p="http://a" xmlns:a="http://b"><p:cSld><p:spTree><p:sp><p:txBody>' +
        `<a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
      const zip = new JSZip()
      zip.file('ppt/slides/slide1.xml', slide('Birinchi'))
      zip.file('ppt/slides/slide2.xml', slide('Ikkinchi'))
      // The one that catches a lexical sort: slide10 must come last.
      zip.file('ppt/slides/slide10.xml', slide('Oninchi'))
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })

      const extracted = await extractSourceText(buffer, { ext: 'pptx' })
      assert.equal(extracted.blocks, 3)
      assert.ok(extracted.text.indexOf('Ikkinchi') < extracted.text.indexOf('Oninchi'))
    })

    test('a pdf becomes pages', async () => {
      const buffer = await new Promise((resolve) => {
        const chunks = []
        const doc = new PDFDocument()
        doc.on('data', (chunk) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.fontSize(12).text('Birinchi sahifa matni')
        doc.addPage().text('Ikkinchi sahifa matni')
        doc.end()
      })
      const extracted = await extractSourceText(buffer, { ext: 'pdf' })
      assert.equal(extracted.blocks, 2)
      assert.match(extracted.text, /Birinchi sahifa/)
    })

    test('a file with no text says so, instead of generating from nothing', async () => {
      const zip = new JSZip()
      zip.file('ppt/slides/slide1.xml', '<?xml version="1.0"?><p:sld xmlns:p="http://a"><p:cSld/></p:sld>')
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      // A scanned PDF lands here too, and "this needs OCR" is the only
      // answer an author can act on.
      await assert.rejects(() => extractSourceText(buffer, { ext: 'pptx' }), { code: 'SOURCE_HAS_NO_TEXT' })
    })

    test('an unsupported format is refused by name', async () => {
      await assert.rejects(() => extractSourceText(Buffer.from('x'), { ext: 'xlsx' }), {
        code: 'UNSUPPORTED_SOURCE_TYPE',
      })
    })
  })

  describe('generating a course (10.3)', () => {
    test('everything lands as a draft, top to bottom', async () => {
      const finished = await runJob({ topic: 'Mehnat xavfsizligi', lang: 'Uzbek' }, { generate: stubGenerate() })

      assert.equal(finished.status, 'DONE')
      const course = await Course.findById(finished.result.courseId).lean()
      // The whole point: nothing generated is live until a person says so.
      assert.equal(course.status, 'DRAFT')
      const topics = await Topic.find({ courseId: course._id }).lean()
      const lessons = await Lesson.find({ courseId: course._id }).lean()
      assert.equal(topics.length, 1)
      assert.equal(lessons.length, 2)
      topics.forEach((topic) => assert.equal(topic.status, 'DRAFT'))
      lessons.forEach((lesson) => assert.equal(lesson.status, 'DRAFT'))
      assert.equal(finished.result.topics, 1)
      assert.equal(finished.result.lessons, 2)
    })

    test('the model’s HTML goes through the same sanitiser as an author’s', async () => {
      const finished = await runJob({ topic: 'Xavfsizlik' }, { generate: stubGenerate() })
      const lesson = await Lesson.findOne({ courseId: finished.result.courseId, title: 'Himoya kiyimi' }).lean()

      const textBlock = lesson.blocks.find((block) => block.type === 'TEXT')
      // "It came from the model" is not a trust boundary.
      assert.doesNotMatch(textBlock.text, /onclick/)
      assert.doesNotMatch(textBlock.text, /alert\(1\)/)
      assert.match(textBlock.text, /<strong>har smena<\/strong>/)

      // Per-type fields survive: a DANGER callout and a header row are the
      // two things the prompt asks for most.
      const callout = lesson.blocks.find((block) => block.type === 'CALLOUT')
      assert.equal(callout.variant, 'DANGER')
      const table = lesson.blocks.find((block) => block.type === 'TABLE')
      assert.equal(table.hasHeader, true)
      assert.equal(table.rows.length, 2)
    })

    test('the usage figures are recorded, and the source text is not kept', async () => {
      const finished = await runJob(
        { sourceText: 'Uzun qo\'llanma matni'.repeat(50), lang: 'Uzbek' },
        { generate: stubGenerate(OUTLINE, { inputTokens: 4321, outputTokens: 1234 }) }
      )
      assert.equal(finished.usage.inputTokens, 4321)
      assert.equal(finished.usage.outputTokens, 1234)
      assert.equal(finished.usage.model, 'claude-opus-5')
      // Keeping a copy of every uploaded manual in the jobs collection is a
      // storage bill with no reader.
      assert.equal(finished.params.sourceText, undefined)
      assert.ok(finished.sourceChars === 0 || finished.sourceChars > 0)
    })

    test('a refusal is a recorded failure, not a half-built course', async () => {
      const before = await Course.countDocuments({})
      const finished = await runJob(
        { topic: 'Nimadir' },
        {
          generate: async () => {
            const error = new Error('The model declined this request')
            error.code = 'AI_REFUSED'
            throw error
          },
        }
      )
      assert.equal(finished.status, 'FAILED')
      assert.match(finished.error, /declined/)
      assert.equal(await Course.countDocuments({}), before)
    })

    test('a job delivered twice does not generate twice', async () => {
      let calls = 0
      const job = await aiGenerationService.create(actor(), {
        type: 'COURSE_OUTLINE',
        params: { topic: 'Takroriy' },
      })
      jobIds.push(new mongoose.Types.ObjectId(job.id))
      // Its own title: every other test in this file generates from the
      // same fixture, so counting by title would count theirs too.
      const outline = { ...OUTLINE, title: `Takroriy ${stamp}` }
      const deps = {
        generate: async () => {
          calls += 1
          return { data: outline, usage: { model: 'claude-opus-5', inputTokens: 1, outputTokens: 1 } }
        },
      }
      await aiGenerationService.run(job.id, deps)
      // A redelivery from the queue would otherwise charge for — and
      // create — the same course again.
      await aiGenerationService.run(job.id, deps)
      assert.equal(calls, 1)

      const finished = await AiGenerationJob.findById(job.id).lean()
      courseIds.push(new mongoose.Types.ObjectId(finished.result.courseId))
      assert.equal(await Course.countDocuments({ title: `Takroriy ${stamp}` }), 1)
    })

    test('an unknown type is refused before anything is written', async () => {
      await assert.rejects(() => aiGenerationService.create(actor(), { type: 'HAIKU', params: {} }), {
        code: 'AI_UNKNOWN_TYPE',
      })
    })
  })


  describe('generating questions (10.4)', () => {
    /** A module with two written lessons, which is the normal input. */
    let quizSeq = 0
    async function makeTopicWithLessons() {
      quizSeq += 1
      const course = await Course.create({
        title: `Quiz source ${stamp}-${quizSeq}`,
        slug: `quiz-source-${stamp}-${quizSeq}`,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      courseIds.push(course._id)
      const topicRow = await Topic.create({
        courseId: course._id,
        title: 'Himoya vositalari',
        slug: `quiz-topic-${stamp}-${quizSeq}`,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      await Lesson.create({
        courseId: course._id,
        topicId: topicRow._id,
        title: 'Kaska',
        blocks: [
          { type: 'HEADING', text: 'Kaska', level: 2 },
          { type: 'TEXT', text: '<p>Kaska <strong>har doim</strong> taqiladi. Telefon 901234567.</p>' },
          { type: 'TABLE', rows: [['Vosita', 'Muddat'], ['Kaska', '2 yil']], hasHeader: true },
        ],
        createdBy: author._id,
      })
      return { course, topic: topicRow }
    }

    const QUESTIONS = {
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Kaska qachon taqiladi?',
          explanation: 'Darsda: har doim.',
          difficulty: 'EASY',
          options: [
            { text: 'Har doim', isCorrect: true },
            { text: 'Faqat yozda', isCorrect: false },
          ],
        },
        { type: 'TRUE_FALSE', text: 'Kaska muddati 2 yil.', correct: true, explanation: 'Jadvalda.' },
        { type: 'SHORT_ANSWER', text: 'Kaskaning muddati necha yil?', accepted: ['2', 'ikki'], explanation: 'Jadvalda.' },
      ],
    }

    const stubQuiz = (payload = QUESTIONS) =>
      async () => ({
        data: payload,
        usage: { model: 'claude-opus-5', inputTokens: 900, outputTokens: 600, cacheReadTokens: 0 },
      })

    test('the module’s own lessons become the source', async () => {
      const { topic: topicRow } = await makeTopicWithLessons()
      const source = await topicSourceText(topicRow._id)
      // Prose, not markup: the model needs what the callout says, not that
      // it was a callout.
      assert.match(source, /Kaska har doim taqiladi/)
      assert.doesNotMatch(source, /<strong>/)
      // A table becomes rows a sentence can be built from.
      assert.match(source, /Kaska \| 2 yil/)
    })

    test('questions land in a bank, with the payload shapes the validator wants', async () => {
      const { course, topic: topicRow } = await makeTopicWithLessons()
      const job = await aiGenerationService.create(actor(), {
        type: 'QUIZ',
        params: { topicId: topicRow._id.toString(), count: 3 },
        topicId: topicRow._id,
      })
      jobIds.push(new mongoose.Types.ObjectId(job.id))
      await aiGenerationService.run(job.id, { generate: stubQuiz() })

      const finished = await AiGenerationJob.findById(job.id).lean()
      assert.equal(finished.status, 'DONE')
      bankIds.push(new mongoose.Types.ObjectId(finished.result.bankId))
      assert.equal(finished.result.questions, 3)
      // A bank, not a live quiz: unreviewed questions must not reach
      // learners, and a bank is what gets reviewed and reused (4.1).
      const bank = await QuestionBank.findById(finished.result.bankId).lean()
      assert.match(bank.name, /Himoya vositalari/)
      assert.deepEqual(bank.tags, ['ai'])

      const questions = await Question.find({ bankId: bank._id }).lean()
      const single = questions.find((question) => question.type === 'SINGLE_CHOICE')
      assert.equal(single.payload.options.filter((option) => option.isCorrect).length, 1)
      assert.equal(questions.find((question) => question.type === 'TRUE_FALSE').payload.correct, true)
      assert.deepEqual(questions.find((question) => question.type === 'SHORT_ANSWER').payload.accepted, ['2', 'ikki'])
      questions.forEach((question) => assert.ok(question.explanation, 'every question explains its answer'))
      assert.ok(course)
    })

    test('a question the validator refuses is dropped, not stored', async () => {
      const { topic: topicRow } = await makeTopicWithLessons()
      const job = await aiGenerationService.create(actor(), {
        type: 'QUIZ',
        params: { topicId: topicRow._id.toString(), count: 2 },
        topicId: topicRow._id,
      })
      jobIds.push(new mongoose.Types.ObjectId(job.id))
      await aiGenerationService.run(job.id, {
        generate: stubQuiz({
          questions: [
            // Two correct options in a single-choice question: the JSON
            // schema cannot express "exactly one", and this grades
            // everybody wrong if it is stored.
            {
              type: 'SINGLE_CHOICE',
              text: 'Ikki javobi bor',
              options: [
                { text: 'A', isCorrect: true },
                { text: 'B', isCorrect: true },
              ],
            },
            { type: 'TRUE_FALSE', text: 'Yaxshi savol', correct: false },
          ],
        }),
      })

      const finished = await AiGenerationJob.findById(job.id).lean()
      bankIds.push(new mongoose.Types.ObjectId(finished.result.bankId))
      assert.equal(finished.result.questions, 1)
      assert.equal(finished.result.rejected.length, 1)
      assert.match(finished.result.rejected[0].reason, /exactly one correct option/)
      assert.equal(await Question.countDocuments({ bankId: finished.result.bankId }), 1)
    })

    test('a module with nothing written says so instead of inventing questions', async () => {
      const course = await Course.create({
        title: `Empty quiz source ${stamp}`,
        slug: `empty-quiz-source-${stamp}`,
        createdBy: author._id,
      })
      courseIds.push(course._id)
      const emptyTopic = await Topic.create({
        courseId: course._id,
        title: 'Faqat video',
        slug: `empty-quiz-topic-${stamp}`,
        createdBy: author._id,
      })

      const job = await aiGenerationService.create(actor(), {
        type: 'QUIZ',
        params: { topicId: emptyTopic._id.toString() },
        topicId: emptyTopic._id,
      })
      jobIds.push(new mongoose.Types.ObjectId(job.id))
      await aiGenerationService.run(job.id, { generate: stubQuiz() })

      const finished = await AiGenerationJob.findById(job.id).lean()
      assert.equal(finished.status, 'FAILED')
      assert.match(finished.error, /no written lessons/)
    })

    test('every generated question is one of the four reliable types', () => {
      // Matching and sequence questions need exactly one correct
      // arrangement; a model asked for those writes plausible pairs that
      // are ambiguous on inspection, which is worse than no question.
      assert.deepEqual(AI_QUIZ_TYPES, ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'])
      AI_QUIZ_TYPES.forEach((type) => assert.ok(PAYLOAD_SCHEMAS[type], `${type} must have a payload schema`))
    })
  })


  describe('translating without cloning (10.5)', () => {
    /** A lesson with the block types that carry words in several places. */
    let translateSeq = 0
    async function makeLesson() {
      translateSeq += 1
      const course = await Course.create({
        title: `Translate source ${stamp}-${translateSeq}`,
        slug: `translate-source-${stamp}-${translateSeq}`,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      courseIds.push(course._id)
      const topicRow = await Topic.create({
        courseId: course._id,
        title: 'Modul',
        slug: `translate-topic-${stamp}-${translateSeq}`,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      const lesson = await Lesson.create({
        courseId: course._id,
        topicId: topicRow._id,
        title: 'Kaska qoidalari',
        description: 'Qisqa izoh',
        status: 'PUBLISHED',
        blocks: [
          { type: 'HEADING', text: 'Kirish', level: 2 },
          { type: 'TEXT', text: '<p>Kaska <strong>har doim</strong> taqiladi.</p>' },
          { type: 'CODE', text: 'const helmet = true', language: 'js' },
          { type: 'TABLE', rows: [['Vosita', 'Muddat'], ['Kaska', '2 yil']], hasHeader: true },
        ],
        createdBy: author._id,
      })
      translatedIds.push(lesson._id)
      return { course, topic: topicRow, lesson }
    }

    test('only the words are sent — never the structure', async () => {
      const { lesson } = await makeLesson()
      const items = collectStrings('Lesson', lesson.toObject())
      const ids = items.map((item) => item.id)

      assert.ok(ids.includes('title'))
      assert.ok(ids.includes('description'))
      // Addressed by block id, which is what lets the answer be merged back
      // without touching order or type.
      assert.ok(ids.some((id) => /^blocks\.[a-f\d]{24}\.text$/.test(id)))
      // Table cells individually, so a translated table stays a table.
      assert.ok(ids.some((id) => /rows\.0\.0$/.test(id)))
      // A CODE block is deliberately left alone: translating an identifier
      // breaks the sample.
      const codeBlock = lesson.blocks.find((block) => block.type === 'CODE')
      assert.equal(
        ids.some((id) => id === `blocks.${codeBlock._id}.text`),
        false
      )
      // Nothing structural travels.
      items.forEach((item) => assert.equal(typeof item.text, 'string'))
    })

    test('the translation is a layer: same ids, same structure, different words', async () => {
      const { lesson } = await makeLesson()
      const items = collectStrings('Lesson', lesson.toObject())

      const job = await aiGenerationService.create(actor(), {
        type: 'TRANSLATION',
        params: { entity: 'Lesson', entityId: lesson._id.toString(), lang: 'ru' },
      })
      jobIds.push(new mongoose.Types.ObjectId(job.id))
      await aiGenerationService.run(job.id, {
        generate: async () => ({
          data: {
            items: items.map((item) => ({ id: item.id, text: `RU:${item.text}` })),
          },
          usage: { model: 'claude-opus-5', inputTokens: 500, outputTokens: 400, cacheReadTokens: 0 },
        }),
      })

      const finished = await AiGenerationJob.findById(job.id).lean()
      assert.equal(finished.status, 'DONE')
      assert.equal(finished.result.lang, 'ru')
      assert.equal(finished.result.missing, 0)

      // A draft is not served to a learner: an unread machine translation
      // in front of an employee is the failure this feature must avoid.
      const asLearner = await lessonService.getById(
        { id: author._id.toString(), permissions: ['video:view'] },
        lesson._id.toString(),
        { lang: 'ru' }
      )
      assert.equal(asLearner.title, 'Kaska qoidalari')

      await aiTranslateService.approve(actor(), finished.result.translationId)
      const translated = await lessonService.getById(
        { id: author._id.toString(), permissions: ['video:view'] },
        lesson._id.toString(),
        { lang: 'ru' }
      )

      assert.equal(translated.title, 'RU:Kaska qoidalari')
      // The ids are the point: reading progress is recorded against them
      // (9.1), so they have to be identical in either language.
      const originalIds = lesson.blocks.map((block) => String(block._id))
      assert.deepEqual(translated.blocks.map((block) => block.id), originalIds)
      assert.deepEqual(
        translated.blocks.map((block) => block.type),
        ['HEADING', 'TEXT', 'CODE', 'TABLE']
      )
      // The code block is untouched; the table keeps its shape.
      assert.equal(translated.blocks[2].text, 'const helmet = true')
      assert.equal(translated.blocks[3].rows[0][0], 'RU:Vosita')
      assert.equal(translated.blocks[3].rows.length, 2)
      // Tags survive the round trip, and the sanitiser still runs.
      assert.match(translated.blocks[1].text, /<strong>/)
    })

    test('an id the model invented is ignored, and a missing one is reported', async () => {
      const { lesson } = await makeLesson()
      const job = await aiGenerationService.create(actor(), {
        type: 'TRANSLATION',
        params: { entity: 'Lesson', entityId: lesson._id.toString(), lang: 'en' },
      })
      jobIds.push(new mongoose.Types.ObjectId(job.id))
      await aiGenerationService.run(job.id, {
        generate: async () => ({
          data: {
            items: [
              { id: 'title', text: 'Helmet rules' },
              // An id that was never sent: merging it would put a paragraph
              // in the lesson that nobody wrote.
              { id: 'blocks.deadbeefdeadbeefdeadbeef.text', text: 'Ghost paragraph' },
            ],
          },
          usage: { model: 'claude-opus-5', inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 },
        }),
      })

      const finished = await AiGenerationJob.findById(job.id).lean()
      assert.equal(finished.result.ignoredUnknownIds, 1)
      assert.ok(finished.result.missing > 0)

      const stored = await ContentTranslation.findById(finished.result.translationId).lean()
      assert.equal(stored.fields['blocks.deadbeefdeadbeefdeadbeef.text'], undefined)
      assert.equal(stored.fields.title, 'Helmet rules')
      // A partial translation still merges what it has, and leaves the rest
      // in the original language rather than blanking it.
      await aiTranslateService.approve(actor(), finished.result.translationId)
      const merged = await lessonService.getById(
        { id: author._id.toString(), permissions: ['video:view'] },
        lesson._id.toString(),
        { lang: 'en' }
      )
      assert.equal(merged.title, 'Helmet rules')
      assert.match(merged.blocks[1].text, /har doim/)
    })

    test('one translation per language, replaced rather than duplicated', async () => {
      const { lesson } = await makeLesson()
      const run = async () => {
        const job = await aiGenerationService.create(actor(), {
          type: 'TRANSLATION',
          params: { entity: 'Lesson', entityId: lesson._id.toString(), lang: 'ru' },
        })
        jobIds.push(new mongoose.Types.ObjectId(job.id))
        await aiGenerationService.run(job.id, {
          generate: async () => ({
            data: { items: [{ id: 'title', text: `RU ${Date.now()}` }] },
            usage: { model: 'claude-opus-5', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
          }),
        })
      }
      await run()
      await run()
      // Two rows for the same pair would make "which one is served" a coin
      // flip; the unique index makes that impossible and the service
      // upserts.
      assert.equal(await ContentTranslation.countDocuments({ entity: 'Lesson', entityId: lesson._id, lang: 'ru' }), 1)
      // And a re-translation goes back to DRAFT: it has not been read.
      const row = await ContentTranslation.findOne({ entity: 'Lesson', entityId: lesson._id, lang: 'ru' }).lean()
      assert.equal(row.status, 'DRAFT')
    })

    test('a course keeps only its title and description', async () => {
      const course = await Course.create({
        title: `Kurs ${stamp}`,
        slug: `translate-course-${stamp}`,
        description: 'Izoh',
        createdBy: author._id,
      })
      courseIds.push(course._id)
      const items = collectStrings('Course', course.toObject())
      assert.deepEqual(items.map((item) => item.id).sort(), ['description', 'title'])
    })
  })

  describe('the monthly budget (10.6)', () => {
    test('usage adds up over the month, from the recorded figures', async () => {
      await runJob({ topic: 'Byudjet 1' }, { generate: stubGenerate(OUTLINE, { inputTokens: 100, outputTokens: 50 }) })
      const usage = await aiBudgetService.usageThisMonth()
      assert.ok(usage.used >= 150)
      assert.ok(usage.jobs >= 1)
      // No ceiling set: "no limit" is null, not a very large number.
      assert.equal(usage.remaining, null)
      assert.equal(usage.exceeded, false)
    })

    test('a spent budget stops the next job before it costs anything', async () => {
      const usage = await aiBudgetService.usageThisMonth()
      // A ceiling just below what has already been spent.
      await Settings.updateOne({ _id: 'global' }, { $set: { 'ai.monthlyTokenBudget': Math.max(1, usage.used - 1) } })
      await settingsService.invalidate?.()

      await assert.rejects(
        () => aiGenerationService.create(actor(), { type: 'COURSE_OUTLINE', params: { topic: 'Yana' } }),
        { code: 'AI_BUDGET_EXCEEDED' }
      )

      await Settings.updateOne({ _id: 'global' }, { $set: { 'ai.monthlyTokenBudget': 0 } })
      await settingsService.invalidate?.()
    })

    test('generation can be switched off entirely, with its own reason', async () => {
      await Settings.updateOne({ _id: 'global' }, { $set: { 'ai.generationEnabled': false } })
      await settingsService.invalidate?.()

      // Not "budget exceeded": a company that wants AI off should not have
      // to read a ceiling of zero as the explanation.
      await assert.rejects(
        () => aiGenerationService.create(actor(), { type: 'COURSE_OUTLINE', params: { topic: 'Yana' } }),
        { code: 'AI_DISABLED' }
      )

      await Settings.updateOne({ _id: 'global' }, { $set: { 'ai.generationEnabled': true } })
      await settingsService.invalidate?.()
    })
  })
})
