import { Course } from '../../models/course.model.js'
import { Topic } from '../../models/topic.model.js'
import { Lesson } from '../../models/lesson.model.js'
import { ContentTranslation } from '../../models/contentTranslation.model.js'
import { toStoredBlocks } from '../courses/lessonBlocks.js'
import { generateStructured } from './aiRun.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'

/**
 * Translating content without cloning it (10.5).
 *
 * The whole design is one decision: **the structure is not translated, only
 * the words.** The model is handed a list of `{ id, text }` and must return
 * the same ids with translated text — it never sees or produces the block
 * types, the order, the ids' meaning, or anything else structural. So a
 * translation cannot reorder a lesson, invent a block, or drop one, and the
 * ids that reading progress is recorded against (9.1) survive by
 * construction.
 *
 * That also makes the prompt small: a lesson of thirty blocks is thirty
 * short strings, not a document to re-emit.
 */

const LANGUAGE_NAMES = { uz: 'Uzbek (latin script)', ru: 'Russian', en: 'English' }

const TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: {
          // The id is echoed back, never generated: it is how the answer is
          // matched to the source.
          id: { type: 'string', maxLength: 120 },
          text: { type: 'string', maxLength: 20000 },
        },
      },
    },
  },
}

function systemPrompt(targetName) {
  return [
    `You translate corporate training content into ${targetName}.`,
    '',
    'You are given a list of items, each with an id and a text. Return the same ids',
    'with the text translated. Rules:',
    '- Translate; do not summarise, expand, correct or comment.',
    '- Keep every HTML tag exactly as it appears (<p>, <strong>, <em>, <ul>, <li>).',
    '  Translate only the words between tags.',
    '- Keep numbers, dates, units and codes unchanged.',
    '- Keep placeholders like [JSHSHIR] or [PHONE] exactly as they are.',
    '- If an item is a proper name or already in the target language, return it unchanged.',
    '- Return an item for every id you were given, and no ids you were not.',
  ].join('\n')
}

/**
 * The translatable strings of one row, addressed by path.
 *
 * Everything else about the row — types, order, ids, flags — is structure
 * and is not sent anywhere.
 */
export function collectStrings(entity, row) {
  const items = []
  const push = (id, text) => {
    const value = String(text ?? '').trim()
    if (value) items.push({ id, text: value })
  }

  push('title', row.title)
  push('description', row.description)

  if (entity === 'Lesson') {
    for (const block of row.blocks ?? []) {
      const id = String(block._id)
      // Only the fields that hold prose. A CODE block is deliberately not
      // translated: translating an identifier breaks the sample.
      if (['HEADING', 'TEXT', 'CALLOUT', 'QUOTE'].includes(block.type)) push(`blocks.${id}.text`, block.text)
      if (block.type === 'QUOTE') push(`blocks.${id}.author`, block.author)
      if (['IMAGE', 'GALLERY', 'EMBED', 'VIDEO', 'FILE', 'TABLE'].includes(block.type)) {
        push(`blocks.${id}.caption`, block.caption)
        push(`blocks.${id}.alt`, block.alt)
      }
      if (block.type === 'TABLE') {
        ;(block.rows ?? []).forEach((cells, rowIndex) => {
          cells.forEach((cell, cellIndex) => push(`blocks.${id}.rows.${rowIndex}.${cellIndex}`, cell))
        })
      }
      if (block.type === 'GALLERY') {
        ;(block.items ?? []).forEach((item, index) => {
          push(`blocks.${id}.items.${index}.caption`, item.caption)
          push(`blocks.${id}.items.${index}.alt`, item.alt)
        })
      }
    }
  }

  return items
}

const MODELS = { Course, Topic, Lesson }

async function loadRow(entity, entityId) {
  const Model = MODELS[entity]
  if (!Model) throw ApiError.badRequest('That kind of content cannot be translated', 'AI_BAD_ENTITY')
  const row = await Model.findById(entityId).lean()
  if (!row) throw ApiError.notFound(`${entity} not found`)
  return row
}

export const aiTranslateService = {
  async run(job, { generate = generateStructured } = {}) {
    const { entity, entityId, lang } = job.params ?? {}
    const targetName = LANGUAGE_NAMES[lang]
    if (!targetName) throw ApiError.badRequest('Unsupported target language', 'AI_BAD_LANGUAGE')

    const row = await loadRow(entity, entityId)
    const items = collectStrings(entity, row)
    if (!items.length) throw ApiError.badRequest('There is nothing to translate here', 'AI_NOTHING_TO_TRANSLATE')

    const { data, usage } = await generate({
      system: systemPrompt(targetName),
      prompt: JSON.stringify({ items }),
      schema: TRANSLATION_SCHEMA,
      maxTokens: 32000,
      effort: 'medium',
    })

    // Matched by id, and **only** ids that were sent are kept: an id the
    // model invented would write a field into the layer that the original
    // does not have, and the merge on read would then produce a lesson with
    // a paragraph nobody wrote.
    const wanted = new Map(items.map((item) => [item.id, item.text]))
    const fields = {}
    let unknown = 0
    for (const item of data.items ?? []) {
      if (!wanted.has(item.id)) {
        unknown += 1
        continue
      }
      const text = String(item.text ?? '').trim()
      if (text) fields[item.id] = text
    }
    const missing = [...wanted.keys()].filter((id) => !(id in fields))

    if (unknown || missing.length) {
      logger.info('Translation answer did not match the request exactly', {
        jobId: String(job._id),
        unknown,
        missing: missing.length,
      })
    }
    if (!Object.keys(fields).length) {
      throw ApiError.badRequest('The translation came back empty', 'AI_TRANSLATION_EMPTY')
    }

    const translation = await ContentTranslation.findOneAndUpdate(
      { entity, entityId, lang },
      {
        $set: {
          fields,
          // A machine translation is a draft by definition; an approved one
          // is one a person has read.
          status: 'DRAFT',
          jobId: job._id,
          model: usage.model,
          staleAt: null,
          createdBy: job.requestedBy,
          approvedBy: null,
          approvedAt: null,
        },
      },
      { new: true, upsert: true }
    )

    return {
      result: {
        translationId: translation._id.toString(),
        entity,
        entityId: String(entityId),
        lang,
        translated: Object.keys(fields).length,
        // Reported rather than hidden: an author who sees "3 missing" knows
        // to read those three, and a silent gap is a lesson with a
        // paragraph still in the original language.
        missing: missing.length,
        ignoredUnknownIds: unknown,
      },
      usage,
    }
  },

  /**
   * The translation layer merged over a row, or the row unchanged.
   *
   * Only an APPROVED translation is served: an unread machine translation
   * in front of a learner is the failure mode this whole feature has to
   * avoid. Structure comes from the original in every case — this only
   * replaces strings, addressed by the paths `collectStrings` produced, so
   * a stale layer can leave text untranslated but can never change what
   * the lesson *is*.
   */
  async applyTo(entity, row, lang, { includeDraft = false } = {}) {
    if (!lang || !LANGUAGE_NAMES[lang]) return row
    const query = { entity, entityId: row._id ?? row.id, lang }
    if (!includeDraft) query.status = 'APPROVED'
    const translation = await ContentTranslation.findOne(query).lean()
    if (!translation) return row

    const fields = translation.fields ?? {}
    const merged = { ...row }
    if (fields.title) merged.title = fields.title
    if (fields.description) merged.description = fields.description

    if (entity === 'Lesson' && Array.isArray(row.blocks)) {
      merged.blocks = row.blocks.map((block) => {
        const id = String(block._id ?? block.id)
        const next = { ...block }
        const text = fields[`blocks.${id}.text`]
        if (text) next.text = text
        const author = fields[`blocks.${id}.author`]
        if (author) next.author = author
        const caption = fields[`blocks.${id}.caption`]
        if (caption) next.caption = caption
        const alt = fields[`blocks.${id}.alt`]
        if (alt) next.alt = alt
        if (Array.isArray(block.rows)) {
          next.rows = block.rows.map((cells, rowIndex) =>
            cells.map((cell, cellIndex) => fields[`blocks.${id}.rows.${rowIndex}.${cellIndex}`] ?? cell)
          )
        }
        if (Array.isArray(block.items)) {
          next.items = block.items.map((item, index) => ({
            ...item,
            caption: fields[`blocks.${id}.items.${index}.caption`] ?? item.caption,
            alt: fields[`blocks.${id}.items.${index}.alt`] ?? item.alt,
          }))
        }
        return next
      })
      // The merged blocks go through the sanitiser as well: the translated
      // HTML is no more trusted than the original's, and a translation that
      // "kept the tags" could have kept a new one.
      merged.blocks = toStoredBlocks(
        merged.blocks.map((block) => ({ ...block, id: String(block._id ?? block.id) }))
      )
    }

    merged.translation = { lang, status: translation.status, staleAt: translation.staleAt }
    return merged
  },

  async list(entity, entityId) {
    const rows = await ContentTranslation.find({ entity, entityId }).lean()
    return rows.map((row) => ({
      id: row._id.toString(),
      lang: row.lang,
      status: row.status,
      fields: Object.keys(row.fields ?? {}).length,
      staleAt: row.staleAt,
      model: row.model,
      updatedAt: row.updatedAt,
    }))
  },

  async approve(actor, id) {
    const translation = await ContentTranslation.findByIdAndUpdate(
      id,
      { $set: { status: 'APPROVED', approvedBy: actor.id, approvedAt: new Date() } },
      { new: true }
    )
    if (!translation) throw ApiError.notFound('Translation not found')
    return { id: translation._id.toString(), status: translation.status }
  },

  async remove(id) {
    const result = await ContentTranslation.deleteOne({ _id: id })
    if (!result.deletedCount) throw ApiError.notFound('Translation not found')
    return { id: String(id) }
  },
}
