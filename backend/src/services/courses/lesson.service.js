import { lessonRepository } from '../../repositories/lesson.repository.js'
import { topicRepository } from '../../repositories/topic.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { openTopic, visibleRows, nextOrder } from './contentItem.js'
import { canManageCourses } from './coursePermissions.js'
import { toStoredBlocks, toPublicBlocks, isPublishable } from './lessonBlocks.js'
import { courseCompletionService } from './courseCompletion.service.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Lessons, as a member of the shared content contract (9.1).
 *
 * Nothing here decides who may see a draft or where a new item lands in the
 * sequence — both come from contentItem.js, which is the point of it. What
 * is specific to a lesson is its blocks: they are sanitised on the way in
 * and they decide whether it may be published at all.
 */

function toPublicLesson(lesson, { includeBlocks = true } = {}) {
  return {
    id: lesson._id.toString(),
    topicId: lesson.topicId.toString(),
    courseId: lesson.courseId.toString(),
    title: lesson.title,
    description: lesson.description,
    status: lesson.status,
    required: lesson.required,
    estimatedMinutes: lesson.estimatedMinutes,
    order: lesson.order,
    // The count travels even when the blocks do not: a curriculum row says
    // "4 blocks" without downloading four blocks per lesson, and the reading
    // progress of an unopened lesson is a fraction of exactly this number.
    blockCount: lesson.blocks?.length ?? 0,
    ...(includeBlocks ? { blocks: toPublicBlocks(lesson.blocks) } : {}),
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  }
}

export const lessonService = {
  /**
   * The lessons of one topic, without their blocks.
   *
   * A topic listing is a table of contents; sending every block of every
   * lesson would make opening a course download the whole course.
   */
  async listByTopic(actor, topicId) {
    const { canManage } = await openTopic(actor, topicId)
    const rows = visibleRows(await lessonRepository.listByTopic(topicId), canManage)
    return rows.map((lesson) => toPublicLesson(lesson, { includeBlocks: false }))
  },

  async getById(actor, id) {
    const lesson = await lessonRepository.findById(id)
    if (!lesson) throw ApiError.notFound('Lesson not found')
    // Same answer the other three content types give a learner about a
    // draft: not "you may not see this", but "this does not exist". Somebody
    // who should not read a draft should not learn that one is being written.
    if (lesson.status !== 'PUBLISHED' && !canManageCourses(actor)) {
      throw ApiError.notFound('Lesson not found')
    }
    return toPublicLesson(lesson)
  },

  async create(actor, topicId, payload) {
    const topic = await topicRepository.findById(topicId)
    if (!topic) throw ApiError.notFound('Topic not found')

    const blocks = toStoredBlocks(payload.blocks)
    if (payload.status === 'PUBLISHED' && !isPublishable(blocks)) {
      throw ApiError.badRequest('A lesson needs at least one block before it can be published', 'LESSON_EMPTY')
    }

    const lesson = await lessonRepository.create({
      topicId,
      courseId: topic.courseId,
      title: payload.title,
      description: payload.description ?? '',
      blocks,
      status: payload.status ?? 'DRAFT',
      required: payload.required !== false,
      estimatedMinutes: payload.estimatedMinutes ?? 0,
      // The end of the topic, counted across all four collections. Not 0,
      // which is where every other content type still starts and the reason
      // a topic could hold six items at three different positions.
      order: payload.order ?? (await nextOrder(topicId)),
      createdBy: actor.id,
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'LESSON_CREATED',
      entity: 'Lesson',
      entityId: lesson._id.toString(),
      metadata: { topicId: String(topicId), blocks: blocks.length, status: lesson.status },
    })

    if (lesson.status === 'PUBLISHED') await this.reevaluate(lesson.courseId, lesson._id)

    return toPublicLesson(lesson)
  },

  async update(actor, id, payload) {
    const existing = await lessonRepository.findById(id)
    if (!existing) throw ApiError.notFound('Lesson not found')

    const changes = { ...payload, updatedBy: actor.id }
    // Absent `blocks` means "leave the body alone" — a rename must not empty
    // a lesson. An empty array is a real instruction and is kept.
    if (payload.blocks !== undefined) changes.blocks = toStoredBlocks(payload.blocks)

    const blocksAfter = changes.blocks ?? existing.blocks
    const statusAfter = payload.status ?? existing.status
    if (statusAfter === 'PUBLISHED' && !isPublishable(blocksAfter)) {
      throw ApiError.badRequest('A lesson needs at least one block before it can be published', 'LESSON_EMPTY')
    }

    const updated = await lessonRepository.updateById(id, changes)

    await auditLogRepository.record({
      actor: actor.id,
      action: 'LESSON_UPDATED',
      entity: 'Lesson',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })

    // Same rule the videos follow: only a change that could move the
    // completion answer walks the learners. Re-titling a lesson must not
    // re-evaluate a course of four hundred people.
    const nowPublished = existing.status !== 'PUBLISHED' && updated.status === 'PUBLISHED'
    const withdrawn = existing.status === 'PUBLISHED' && updated.status !== 'PUBLISHED'
    const requirementChanged = payload.required !== undefined && payload.required !== existing.required
    // A published lesson that grows or loses a block changes what finishing
    // it means, and readers who had finished the old set are no longer
    // through the new one (AT-04).
    const bodyChanged =
      changes.blocks !== undefined &&
      updated.status === 'PUBLISHED' &&
      changes.blocks.length !== existing.blocks.length

    if (nowPublished || withdrawn || requirementChanged || bodyChanged) {
      await this.reevaluate(updated.courseId, id)
    }

    return toPublicLesson(updated)
  },

  async remove(actor, id) {
    const existing = await lessonRepository.findById(id)
    if (!existing) throw ApiError.notFound('Lesson not found')

    await lessonRepository.deleteById(id)
    // Progress rows are left where they are, like every other content type:
    // the orphan sweep in 9.5 is what clears them. Deleting them here would
    // also be the wrong call for a lesson removed by mistake and restored.

    await auditLogRepository.record({
      actor: actor.id,
      action: 'LESSON_DELETED',
      entity: 'Lesson',
      entityId: id,
      metadata: { topicId: existing.topicId.toString(), title: existing.title },
    })

    // Removing a published item can *complete* a course for people who had
    // finished everything else, and nobody in that group is making a request
    // now. Videos and materials do not do this yet on delete — a real gap,
    // recorded in the checklist rather than fixed here in passing.
    if (existing.status === 'PUBLISHED') await this.reevaluate(existing.courseId, id)
  },

  /** Best-effort: the edit is the fact, walking the learners is a follow-up. */
  async reevaluate(courseId, lessonId) {
    await courseCompletionService.evaluateCourse(courseId).catch((error) => {
      logger.warn('Re-evaluating completion after a lesson change failed', {
        lessonId: String(lessonId),
        courseId: String(courseId),
        error: error.message,
      })
    })
  },
}
