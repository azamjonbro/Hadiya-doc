import { topicRepository } from '../../repositories/topic.repository.js'
import { Video } from '../../models/video.model.js'
import { Material } from '../../models/material.model.js'
import { Assessment } from '../../models/assessment.model.js'
import { canManageCourses } from './coursePermissions.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * What every piece of content inside a topic has in common (9.1).
 *
 * A topic holds videos, files, presentations, audio, tests — and now lessons
 * — in four different collections. They are different enough to deserve
 * their own models and identical in the three things this file owns: who may
 * see them, where they sit in the sequence, and how that sequence is
 * rewritten.
 *
 * The visibility gate is the reason this exists. It was written out three
 * times, word for word, in video.service, material.service and
 * assessment.service: load the topic, refuse it if it is a draft and the
 * caller cannot manage courses, then drop the draft rows. Three copies of a
 * fence is one copy that will eventually be wrong — and the one that goes
 * wrong is the one nobody edits, because the other two looked fine.
 *
 * Built up a piece at a time rather than as a rewrite: the four models keep
 * their own shapes and their own routes. What is shared is the contract.
 */

/**
 * Which collection an item lives in.
 *
 * Separate from the `contentType` the API reports, because a material
 * reports FILE / PRESENTATION / MULTIMEDIA — three labels for one
 * collection. A reorder has to know where to write, not what to call it.
 */
export const CONTENT_KINDS = {
  VIDEO: 'VIDEO',
  MATERIAL: 'MATERIAL',
  ASSESSMENT: 'ASSESSMENT',
  LESSON: 'LESSON',
}

const MODEL_BY_KIND = {
  [CONTENT_KINDS.VIDEO]: Video,
  [CONTENT_KINDS.MATERIAL]: Material,
  [CONTENT_KINDS.ASSESSMENT]: Assessment,
  // Registered lazily: importing the Lesson model here would make this
  // module and lesson.model.js import each other.
  [CONTENT_KINDS.LESSON]: null,
}

/** Lets the Lesson model join without a circular import. */
export function registerContentModel(kind, model) {
  MODEL_BY_KIND[kind] = model
}

/** The `contentType` an API reports, mapped back to its collection. */
export function kindOfContentType(contentType) {
  if (['FILE', 'PRESENTATION', 'MULTIMEDIA', 'MATERIAL'].includes(contentType)) return CONTENT_KINDS.MATERIAL
  return CONTENT_KINDS[contentType] ?? null
}

/**
 * The one gate into a topic's contents.
 *
 * A draft topic is `notFound` rather than `forbidden` for a learner, on
 * purpose: "you may not see this" and "this does not exist" are the same
 * answer to someone who should not know a draft is being written.
 */
export async function openTopic(actor, topicId) {
  const topic = await topicRepository.findById(topicId)
  if (!topic) throw ApiError.notFound('Topic not found')
  const canManage = canManageCourses(actor)
  if (topic.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Topic not found')
  return { topic, canManage }
}

/** Drafts are for the people who can edit them. */
export function visibleRows(rows, canManage) {
  return canManage ? rows : rows.filter((row) => row.status === 'PUBLISHED')
}

/**
 * The position a newly added item takes: the end of the topic.
 *
 * Counted across all four collections, because they share one sequence. Each
 * type used to number from its own last item, so a topic with three videos
 * and three files had two items at order 0, two at 1 and two at 2 — and the
 * merged list came out in whatever order the sort happened to settle on.
 */
export async function nextOrder(topicId) {
  const models = Object.values(MODEL_BY_KIND).filter(Boolean)
  const highest = await Promise.all(
    models.map((model) => model.findOne({ topicId }, { order: 1 }).sort({ order: -1 }).lean())
  )
  const max = highest.reduce((best, row) => Math.max(best, row?.order ?? -1), -1)
  return max + 1
}

/** How many items the topic holds, across every collection. */
export async function countContent(topicId) {
  const models = Object.values(MODEL_BY_KIND).filter(Boolean)
  const counts = await Promise.all(models.map((model) => model.countDocuments({ topicId })))
  return counts.reduce((sum, count) => sum + count, 0)
}

/**
 * Rewrites the sequence of a topic's contents.
 *
 * Takes the whole list in its new order rather than "move item X to position
 * 3": the caller is a screen showing every item, the order it displays is
 * the order it means, and a relative move has to be replayed against a
 * server state that may already have changed.
 *
 * Positions are assigned from the array index, so the numbers are dense
 * afterwards however tangled they were before. That is the repair as much as
 * the reorder — the four collections have been numbering independently.
 */
export async function reorderContent(topicId, items) {
  // The list has to be the whole topic. A caller that sends four of six
  // items numbers those four from zero and leaves the other two where they
  // were, so the collisions this function exists to repair come straight
  // back — which is exactly what happened the first time it was called with
  // a stale list. A client whose list is out of date should reload it, and
  // saying so is more use than a silently tangled curriculum.
  const total = await countContent(topicId)
  if (items.length !== total) {
    throw ApiError.badRequest(
      'Send the topic\'s whole content list in its new order',
      'INCOMPLETE_ORDER',
      { sent: items.length, expected: total }
    )
  }

  const byKind = new Map()
  items.forEach((item, index) => {
    const kind = kindOfContentType(item.contentType)
    const model = kind ? MODEL_BY_KIND[kind] : null
    if (!model) throw ApiError.badRequest(`Unknown content type: ${item.contentType}`, 'UNKNOWN_CONTENT_TYPE')
    if (!byKind.has(kind)) byKind.set(kind, [])
    byKind.get(kind).push({ id: item.id, order: index })
  })

  const writes = []
  for (const [kind, rows] of byKind) {
    const model = MODEL_BY_KIND[kind]
    writes.push(
      model.bulkWrite(
        rows.map((row) => ({
          // Scoped to the topic as well as the id: an id from another topic
          // must not be reorderable by naming it here.
          updateOne: { filter: { _id: row.id, topicId }, update: { $set: { order: row.order } } },
        }))
      )
    )
  }

  const results = await Promise.all(writes)
  return { reordered: results.reduce((sum, result) => sum + (result.modifiedCount ?? 0), 0) }
}
