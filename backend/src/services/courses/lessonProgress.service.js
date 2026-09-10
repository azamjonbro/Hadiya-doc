import { lessonRepository } from '../../repositories/lesson.repository.js'
import { lessonProgressRepository } from '../../repositories/lessonProgress.repository.js'
import { lessonCompletion } from './lessonBlocks.js'
import { canManageCourses } from './coursePermissions.js'
import { courseCompletionService } from './courseCompletion.service.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Reading progress through a lesson (9.1).
 *
 * Deliberately the same shape as materialProgress: a set of the pieces
 * actually seen, not a furthest-point marker. A reader who jumps to the end
 * of a page has read the end of a page.
 */

// Finishing a lesson can be the last thing a course was waiting for.
// Best-effort, like every other call site: the reading is already saved, and
// losing the status update is the smaller loss.
async function evaluateCourse(userId, courseId) {
  if (!courseId) return
  try {
    await courseCompletionService.evaluate(userId, courseId)
  } catch (error) {
    logger.warn('Course completion evaluation failed after lesson progress', {
      userId: String(userId),
      courseId: String(courseId),
      error: error.message,
    })
  }
}

async function openLesson(actor, lessonId) {
  const lesson = await lessonRepository.findById(lessonId)
  if (!lesson) throw ApiError.notFound('Lesson not found')
  if (lesson.status !== 'PUBLISHED' && !canManageCourses(actor)) throw ApiError.notFound('Lesson not found')
  return lesson
}

function toPublicProgress(lessonId, lesson, row) {
  return { lessonId: String(lessonId), ...lessonCompletion(lesson, row) }
}

export const lessonProgressService = {
  async get(actor, lessonId) {
    const lesson = await openLesson(actor, lessonId)
    const row = await lessonProgressRepository.findByUserAndLesson(actor.id, lessonId)
    return toPublicProgress(lessonId, lesson, row)
  },

  /**
   * Blocks that have been on screen. Idempotent — the same block arriving
   * twice must not move the number, which is why this stores a set.
   */
  async recordBlocks(actor, lessonId, blockIds) {
    const lesson = await openLesson(actor, lessonId)

    const known = new Set(lesson.blocks.map((block) => String(block._id)))
    const accepted = [...new Set(blockIds.map(String))].filter((id) => known.has(id))
    // Ids the lesson does not contain are dropped rather than refused: an
    // author editing a lesson while somebody reads it makes the reader's
    // next report partly stale, and that is not the reader's fault. All of
    // them being unknown is a different thing — a client sending ids from
    // another lesson entirely — and that is worth saying out loud.
    if (!accepted.length) {
      throw ApiError.badRequest('None of those blocks belong to this lesson', 'UNKNOWN_BLOCK')
    }

    let row = await lessonProgressRepository.findByUserAndLesson(actor.id, lessonId)
    if (!row) {
      row = await lessonProgressRepository.create({
        userId: actor.id,
        lessonId,
        courseId: lesson.courseId,
        topicId: lesson.topicId,
        viewedBlocks: [],
        firstViewedAt: new Date(),
      })
    }

    const seen = new Set(row.viewedBlocks.map(String))
    accepted.forEach((id) => seen.add(id))
    row.viewedBlocks = [...seen]
    row.lastViewedAt = new Date()

    const progress = lessonCompletion(lesson, row)
    if (progress.completed && !row.completedAt) row.completedAt = new Date()

    await lessonProgressRepository.save(row)
    await evaluateCourse(actor.id, row.courseId)

    return toPublicProgress(lessonId, lesson, row)
  },

  /**
   * The reader saying they are done, from the end of the lesson.
   *
   * Needed for the same reason materials have it: a block scrolled past in a
   * fast swipe leaves the count at 9 of 10 forever with nothing the reader
   * can do about it. The last block must have been seen — the client asking
   * nicely is not the control.
   */
  async markComplete(actor, lessonId) {
    const lesson = await openLesson(actor, lessonId)
    if (!lesson.blocks.length) {
      throw ApiError.badRequest('This lesson has no content yet', 'LESSON_EMPTY')
    }

    const row = await lessonProgressRepository.findByUserAndLesson(actor.id, lessonId)
    if (!row) throw ApiError.badRequest('Open the lesson before marking it finished', 'LESSON_NOT_STARTED')

    const lastBlockId = String(lesson.blocks[lesson.blocks.length - 1]._id)
    if (!row.viewedBlocks.map(String).includes(lastBlockId)) {
      throw ApiError.badRequest('Read to the end of the lesson before marking it finished', 'LESSON_NOT_AT_END')
    }

    if (!row.completedAt) {
      row.completedAt = new Date()
      row.lastViewedAt = new Date()
      await lessonProgressRepository.save(row)
      await evaluateCourse(actor.id, row.courseId)
    }

    return toPublicProgress(lessonId, lesson, row)
  },
}
