import { Course } from '../../models/course.model.js'
import { Topic } from '../../models/topic.model.js'
import { Lesson } from '../../models/lesson.model.js'
import { slugify } from '../../utils/slugify.js'
import { toStoredBlocks } from '../courses/lessonBlocks.js'
import { generateStructured } from './aiRun.js'
import { redactPii } from './piiRedact.js'
import { logger } from '../../config/logger.js'

/**
 * Turning a document (or a topic) into a course (10.3).
 *
 * The rule that shapes everything here: **the result is always a draft.**
 * A generated course is a first draft written by something that has never
 * met the company — it gets the structure right and the specifics wrong,
 * and an author who has to unpublish a wrong course learns not to use the
 * feature. So the course, its topics and every lesson are created as DRAFT,
 * and publishing stays a decision a person makes afterwards.
 *
 * The blocks the model may produce are deliberately limited to the ones it
 * can actually author: headings, prose, callouts, quotes, tables, code and
 * dividers. It cannot upload an image or reference a video that does not
 * exist, so those types are not in the schema — a generator that emits a
 * reference to nothing produces content that has to be repaired by hand.
 */

const ALLOWED_BLOCK_TYPES = ['HEADING', 'TEXT', 'CALLOUT', 'QUOTE', 'TABLE', 'CODE', 'DIVIDER']

// The schema is what makes the answer usable as rows rather than prose. It
// is also the whole specification of the output — anything not described
// here is not produced.
const OUTLINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'topics'],
  properties: {
    title: { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 2000 },
    // Big enough for a real manual, small enough that one job cannot
    // generate a hundred topics of filler.
    topics: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'lessons'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string', maxLength: 1000 },
          lessons: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'blocks'],
              properties: {
                title: { type: 'string', maxLength: 200 },
                estimatedMinutes: { type: 'integer', minimum: 1, maximum: 240 },
                blocks: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 30,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['type'],
                    properties: {
                      type: { type: 'string', enum: ALLOWED_BLOCK_TYPES },
                      // HEADING, QUOTE, CODE: plain text. TEXT, CALLOUT:
                      // simple HTML, sanitised on the way into the row.
                      text: { type: 'string', maxLength: 8000 },
                      level: { type: 'integer', minimum: 2, maximum: 4 },
                      variant: { type: 'string', enum: ['INFO', 'WARNING', 'SUCCESS', 'DANGER'] },
                      author: { type: 'string', maxLength: 200 },
                      language: { type: 'string', maxLength: 30 },
                      rows: {
                        type: 'array',
                        maxItems: 30,
                        items: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 400 } },
                      },
                      hasHeader: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

function systemPrompt(lang) {
  return [
    'You write corporate training courses for a company in Uzbekistan.',
    `Write everything — titles, prose, table cells — in ${lang}.`,
    'You are given source material. Build a course from what it actually says.',
    '',
    'Rules:',
    '- Never invent a fact, a number, a regulation or a company name that is not in the source.',
    '  If the source is thin, produce fewer lessons rather than padding them.',
    '- A lesson is prose a person reads, not a slide of bullet fragments.',
    '- Use a CALLOUT with variant DANGER or WARNING for anything the source presents as',
    '  a prohibition or a safety risk.',
    '- TEXT and CALLOUT accept simple HTML: <p>, <strong>, <em>, <ul>/<ol> with <li>.',
    '  No attributes, no scripts, no images.',
    '- The reader is an employee, not a student: no "in this lesson we will learn".',
    '',
    'Placeholders like [JSHSHIR], [PHONE] or [EMAIL] in the source are redacted personal',
    'data. Never reproduce them and never write anything in their place.',
  ].join('\n')
}

function userPrompt({ sourceText, topic, lessonCount, lang }) {
  if (sourceText) {
    return [
      'Source material follows, between the markers.',
      lessonCount ? `Aim for about ${lessonCount} lessons in total.` : '',
      '',
      '--- SOURCE START ---',
      sourceText,
      '--- SOURCE END ---',
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    `Build a course on: ${topic}`,
    `Write it in ${lang}.`,
    lessonCount ? `Aim for about ${lessonCount} lessons in total.` : '',
    '',
    'There is no source document, so stay at the level of generally accepted practice',
    'and do not attribute anything to this company specifically.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Only the fields each block type actually has, so the row is clean. */
function toBlock(block) {
  const base = { type: block.type }
  switch (block.type) {
    case 'HEADING':
      return { ...base, text: block.text ?? '', level: block.level ?? 2 }
    case 'TEXT':
      return { ...base, text: block.text ?? '' }
    case 'CALLOUT':
      return { ...base, text: block.text ?? '', variant: block.variant ?? 'INFO' }
    case 'QUOTE':
      return { ...base, text: block.text ?? '', author: block.author ?? '' }
    case 'CODE':
      return { ...base, text: block.text ?? '', language: block.language ?? '' }
    case 'TABLE':
      return { ...base, rows: block.rows ?? [], hasHeader: block.hasHeader !== false }
    default:
      return { type: 'DIVIDER' }
  }
}

async function uniqueSlug(title) {
  const base = slugify(title) || 'kurs'
  let slug = base
  let counter = 2
  // eslint-disable-next-line no-await-in-loop
  while (await Course.exists({ slug })) {
    slug = `${base}-${counter}`
    counter += 1
  }
  return slug
}

export const aiCourseService = {
  /**
   * @param {object} job the AiGenerationJob row
   * @param {{generate?: Function}} [deps] the model call, injectable — the
   *   server has no API key in development, so the rows this writes are
   *   tested against a stub that returns the same shapes the API does
   *   (including a refusal and a truncated answer).
   * @returns {Promise<{result: object, usage: object}>}
   */
  async run(job, { generate = generateStructured } = {}) {
    const { sourceText: rawSource, topic, lessonCount, lang = 'Uzbek' } = job.params ?? {}

    // Redacted here rather than at upload: this is the last point before
    // the text leaves the building (10.6).
    const redacted = rawSource ? redactPii(rawSource) : { text: '', redactions: {}, total: 0 }
    if (redacted.total) {
      logger.info('Redacted personal data before an AI request', {
        jobId: String(job._id),
        redactions: redacted.redactions,
      })
    }

    const { data, usage } = await generate({
      system: systemPrompt(lang),
      prompt: userPrompt({ sourceText: redacted.text, topic, lessonCount, lang }),
      schema: OUTLINE_SCHEMA,
      // A course with lessons is a long answer; above the non-streaming
      // ceiling this streams (aiRun.js).
      maxTokens: 32000,
      effort: 'high',
    })

    const course = await Course.create({
      title: data.title,
      slug: await uniqueSlug(data.title),
      description: data.description ?? '',
      // Always a draft (see the module comment).
      status: 'DRAFT',
      createdBy: job.requestedBy,
    })

    let topicOrder = 0
    let lessonTotal = 0
    const topicIds = []

    for (const outlineTopic of data.topics ?? []) {
      const topicRow = await Topic.create({
        courseId: course._id,
        title: outlineTopic.title,
        slug: `${slugify(outlineTopic.title) || 'mavzu'}-${topicOrder + 1}`,
        description: outlineTopic.description ?? '',
        order: topicOrder,
        status: 'DRAFT',
        createdBy: job.requestedBy,
      })
      topicIds.push(topicRow._id)
      topicOrder += 1

      let lessonOrder = 0
      for (const outlineLesson of outlineTopic.lessons ?? []) {
        // Through the same sanitiser every hand-written lesson goes
        // through: the model's HTML is no more trusted than an author's.
        const blocks = toStoredBlocks((outlineLesson.blocks ?? []).map(toBlock))
        if (!blocks.length) continue
        await Lesson.create({
          courseId: course._id,
          topicId: topicRow._id,
          title: outlineLesson.title,
          blocks,
          estimatedMinutes: outlineLesson.estimatedMinutes ?? 0,
          order: lessonOrder,
          status: 'DRAFT',
          createdBy: job.requestedBy,
        })
        lessonOrder += 1
        lessonTotal += 1
      }
    }

    return {
      result: {
        courseId: course._id.toString(),
        title: course.title,
        topics: topicIds.length,
        lessons: lessonTotal,
        redactions: redacted.redactions,
        truncatedSource: Boolean(job.params?.truncatedSource),
      },
      usage,
    }
  },
}
