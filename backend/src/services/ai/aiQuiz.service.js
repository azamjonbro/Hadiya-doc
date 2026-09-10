import { Question } from '../../models/question.model.js'
import { QuestionBank } from '../../models/questionBank.model.js'
import { Lesson } from '../../models/lesson.model.js'
import { Topic } from '../../models/topic.model.js'
import { PAYLOAD_SCHEMAS } from '../../validators/question.validator.js'
import { generateStructured } from './aiRun.js'
import { redactPii } from './piiRedact.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Questions, written from content that already exists (10.4).
 *
 * The valuable direction is "make a test for this module", not "make a test
 * about safety in general" — a question generated from the lesson the
 * learner just read is checkable against it, and a question invented from
 * the model's general knowledge is a question about something the course
 * never said. So a topic is the normal input: its lessons are read, turned
 * back into plain text, and that is the source.
 *
 * Everything lands in a **question bank** rather than in a quiz. A bank is
 * reviewable, reusable and editable; generating a live quiz would put
 * unreviewed questions in front of learners, and the whole point of the
 * bank (4.1) is that a question is written once and borrowed.
 *
 * Four types, not fourteen: single choice, multiple choice, true/false and
 * short answer. Those are the ones a model produces reliably from prose.
 * Matching and sequence questions need a set of items with exactly one
 * correct arrangement, and a model asked for those writes plausible pairs
 * that are ambiguous on inspection — worse than no question, because a
 * reviewer has to notice.
 */

const GENERATED_TYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']

const QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'text'],
        properties: {
          type: { type: 'string', enum: GENERATED_TYPES },
          text: { type: 'string', maxLength: 1000 },
          // Shown after the attempt. Asked for on every question because a
          // wrong answer with no explanation teaches nothing.
          explanation: { type: 'string', maxLength: 1000 },
          difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
          // SINGLE_CHOICE / MULTI_CHOICE
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'isCorrect'],
              properties: {
                text: { type: 'string', maxLength: 400 },
                isCorrect: { type: 'boolean' },
              },
            },
          },
          // TRUE_FALSE
          correct: { type: 'boolean' },
          // SHORT_ANSWER
          accepted: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', maxLength: 200 } },
        },
      },
    },
  },
}

function systemPrompt(lang) {
  return [
    'You write assessment questions for corporate training.',
    `Write every question, option and explanation in ${lang}.`,
    '',
    'Rules:',
    '- Ask only about what the source material actually states. A question whose answer',
    '  is not in the source is a question about nothing.',
    '- Wrong options must be plausible and clearly wrong to somebody who read the source.',
    '  Never use "all of the above", "none of the above", or an option that is a joke.',
    '- Exactly one correct option for SINGLE_CHOICE; at least one for MULTI_CHOICE.',
    '- SHORT_ANSWER only where the answer is a word or a number, and list every spelling',
    '  a correct answer could take.',
    '- Every question carries an explanation that says why the answer is right, quoting',
    '  the source where possible.',
    '- Do not number the questions; do not write "Question 1:".',
    '',
    'Placeholders like [JSHSHIR] or [PHONE] in the source are redacted personal data.',
    'Never ask about them and never reproduce them.',
  ].join('\n')
}

/**
 * The payload each type needs, in the shape question.validator.js checks.
 *
 * Option ids are added here rather than asked of the model: an attempt
 * records the id it chose, so the ids have to be stable and unique inside
 * the question — and a model asked to invent identifiers will eventually
 * reuse one. Positional (`o1`, `o2`) is enough, because a generated
 * question is reviewed before anybody answers it.
 */
function toPayload(question) {
  switch (question.type) {
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE':
      return {
        options: (question.options ?? []).map((option, index) => ({
          id: `o${index + 1}`,
          text: option.text,
          isCorrect: Boolean(option.isCorrect),
        })),
      }
    case 'TRUE_FALSE':
      return { correct: Boolean(question.correct) }
    case 'SHORT_ANSWER':
      return { accepted: question.accepted ?? [], caseSensitive: false }
    default:
      return null
  }
}

/**
 * The text of a topic's lessons, as the source for its questions.
 *
 * Blocks are flattened back to prose — the model does not need to know
 * about callouts and tables, only what they say. A topic with no lessons
 * has nothing to ask about, which is a refusal rather than an empty quiz.
 */
export async function topicSourceText(topicId) {
  const lessons = await Lesson.find({ topicId }).sort({ order: 1 }).lean()
  const parts = []

  for (const lesson of lessons) {
    parts.push(`# ${lesson.title}`)
    for (const block of lesson.blocks ?? []) {
      if (['TEXT', 'CALLOUT', 'QUOTE', 'HEADING'].includes(block.type) && block.text) {
        parts.push(String(block.text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
      }
      if (block.type === 'TABLE') {
        ;(block.rows ?? []).forEach((row) => parts.push(row.join(' | ')))
      }
      if (block.type === 'CODE' && block.text) parts.push(block.text)
    }
  }

  return parts.filter(Boolean).join('\n')
}

export const aiQuizService = {
  /**
   * @param {object} job
   * @param {{generate?: Function}} [deps]
   */
  async run(job, { generate = generateStructured } = {}) {
    const {
      sourceText: rawSource,
      topicId,
      topic,
      count = 10,
      lang = 'Uzbek',
      types = GENERATED_TYPES,
      bankId = null,
    } = job.params ?? {}

    let source = rawSource ?? ''
    let bankName = topic ? `AI: ${topic}` : 'AI savollari'

    if (topicId) {
      const topicRow = await Topic.findById(topicId).lean()
      if (!topicRow) throw ApiError.notFound('Topic not found')
      source = await topicSourceText(topicId)
      if (!source) {
        // A topic whose content is videos and files has nothing this can
        // read; saying so beats inventing questions from the title.
        throw ApiError.badRequest('This module has no written lessons to build questions from', 'AI_NO_SOURCE_CONTENT')
      }
      bankName = `AI: ${topicRow.title}`
    }

    if (!source && !topic) throw ApiError.badRequest('Nothing to build questions from', 'AI_NO_INPUT')

    const redacted = redactPii(source)
    if (redacted.total) {
      logger.info('Redacted personal data before an AI quiz request', {
        jobId: String(job._id),
        redactions: redacted.redactions,
      })
    }

    const allowed = types.filter((type) => GENERATED_TYPES.includes(type))
    const prompt = [
      `Write ${count} questions.`,
      `Use only these types: ${(allowed.length ? allowed : GENERATED_TYPES).join(', ')}.`,
      redacted.text ? 'Source material follows, between the markers.' : `Topic: ${topic}`,
      redacted.text ? '\n--- SOURCE START ---' : '',
      redacted.text,
      redacted.text ? '--- SOURCE END ---' : '',
    ]
      .filter(Boolean)
      .join('\n')

    const { data, usage } = await generate({
      system: systemPrompt(lang),
      prompt,
      schema: QUIZ_SCHEMA,
      maxTokens: 16000,
      effort: 'high',
    })

    const bank =
      (bankId ? await QuestionBank.findById(bankId) : null) ??
      (await QuestionBank.create({
        name: bankName.slice(0, 200),
        description: 'AI tomonidan yozilgan, tekshirilishi kerak',
        courseId: job.courseId ?? null,
        tags: ['ai'],
        createdBy: job.requestedBy,
      }))

    const created = []
    const rejected = []

    for (const question of data.questions ?? []) {
      const payload = toPayload(question)
      const schema = PAYLOAD_SCHEMAS[question.type]
      if (!payload || !schema) {
        rejected.push({ text: question.text, reason: 'unsupported type' })
        continue
      }
      // The model's answer has to satisfy the same validator an author's
      // does. This is where "exactly one correct option" is actually
      // enforced — the JSON schema cannot express it, and a single-choice
      // question with two right answers grades everybody wrong.
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        rejected.push({ text: question.text, reason: parsed.error.issues[0]?.message ?? 'invalid payload' })
        continue
      }

      const row = await Question.create({
        bankId: bank._id,
        type: question.type,
        text: question.text,
        explanation: question.explanation ?? '',
        difficulty: question.difficulty ?? 'MEDIUM',
        tags: ['ai'],
        payload: parsed.data,
        createdBy: job.requestedBy,
      })
      created.push(row._id.toString())
    }

    if (!created.length) {
      // An empty bank is worse than a failure: it looks like the feature
      // worked and left nothing to review.
      throw ApiError.badRequest('None of the generated questions were usable', 'AI_NO_USABLE_QUESTIONS', {
        rejected: rejected.length,
      })
    }

    return {
      result: {
        bankId: bank._id.toString(),
        bankName: bank.name,
        questions: created.length,
        rejected,
        redactions: redacted.redactions,
      },
      usage,
    }
  },
}

export const AI_QUIZ_TYPES = GENERATED_TYPES
