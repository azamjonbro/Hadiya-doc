import { materialProgressRepository } from '../../repositories/materialProgress.repository.js'
import { materialRepository } from '../../repositories/material.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { courseCompletionService } from '../courses/courseCompletion.service.js'
import { logger } from '../../config/logger.js'

// A document with more pages than this is almost certainly a viewer bug
// rather than a real deck, and an inflated denominator would silently peg
// everyone's progress near zero.
const MAX_PAGES = 5000

// Reading a document can be the last thing a course was waiting for — a
// course made only of presentations has nothing else that would ever
// finish it (AT-01). Best-effort, like the other call sites: the reading
// progress is already saved, and losing the status update is the smaller
// loss.
async function evaluateCourse(userId, courseId) {
  if (!courseId) return
  try {
    await courseCompletionService.evaluate(userId, courseId)
  } catch (error) {
    logger.warn('Course completion evaluation failed after material progress', {
      userId: String(userId),
      courseId: String(courseId),
      error: error.message,
    })
  }
}

export const materialProgressService = {
  /**
   * One page seen. Called as the reader turns pages, so it has to be cheap and
   * idempotent — the same page arriving twice must not move the number.
   */
  async recordPage(actor, materialId, { page, totalPages }) {
    const material = await materialRepository.findById(materialId)
    if (!material) throw ApiError.notFound('Material not found')

    const total = Math.min(Math.max(Math.trunc(totalPages ?? 0), 0), MAX_PAGES)
    const pageNumber = Math.trunc(page ?? 0)
    if (pageNumber < 1 || (total && pageNumber > total)) {
      throw ApiError.badRequest('Page is outside the document', 'PAGE_OUT_OF_RANGE')
    }

    let row = await materialProgressRepository.findByUserAndMaterial(actor.id, materialId)
    if (!row) {
      row = await materialProgressRepository.create({
        userId: actor.id,
        materialId,
        courseId: material.courseId,
        topicId: material.topicId,
        totalPages: total,
        viewedPages: [],
        firstViewedAt: new Date(),
      })
    }

    // A re-opened document may report a different count — a viewer upgrade, a
    // replaced file. The larger wins: shrinking the denominator would hand
    // people completion they never earned.
    if (total > row.totalPages) row.totalPages = total

    if (!row.viewedPages.includes(pageNumber)) {
      row.viewedPages.push(pageNumber)
      row.viewedPages.sort((a, b) => a - b)
    }

    row.completionPercent = row.totalPages
      ? Math.min(100, Math.round((row.viewedPages.length / row.totalPages) * 100))
      : 0
    row.lastViewedAt = new Date()
    if (row.completionPercent >= 100 && !row.completedAt) row.completedAt = new Date()
    // Finished stays finished. Re-opening a completed document and landing on
    // page one would otherwise recompute the percentage back down, and a
    // course that was complete yesterday would quietly un-complete itself.
    if (row.completedAt) row.completionPercent = 100

    await materialProgressRepository.save(row)
    await evaluateCourse(actor.id, row.courseId)

    return {
      materialId,
      totalPages: row.totalPages,
      viewedPages: row.viewedPages.length,
      completionPercent: row.completionPercent,
      completed: Boolean(row.completedAt),
    }
  },

  /**
   * The reader saying they are done, from the last page of the document.
   *
   * Needed because "every page was displayed" and "this person has finished"
   * are not the same thing: a slide skipped on the way through leaves the
   * count at 9 of 10 forever, with nothing the reader can do about it. The
   * button is only offered at the end of the document, and the service checks
   * that too — the client asking nicely is not the control.
   */
  async markComplete(actor, materialId) {
    const material = await materialRepository.findById(materialId)
    if (!material) throw ApiError.notFound('Material not found')

    const row = await materialProgressRepository.findByUserAndMaterial(actor.id, materialId)
    if (!row || !row.totalPages) {
      throw ApiError.badRequest('Open the document before marking it finished', 'MATERIAL_NOT_STARTED')
    }
    if (!row.viewedPages.includes(row.totalPages)) {
      throw ApiError.badRequest('Read to the last page before marking it finished', 'MATERIAL_NOT_AT_END')
    }

    if (!row.completedAt) {
      row.completedAt = new Date()
      row.completionPercent = 100
      row.lastViewedAt = new Date()
      await materialProgressRepository.save(row)
      await evaluateCourse(actor.id, row.courseId)
    }

    return {
      materialId,
      totalPages: row.totalPages,
      viewedPages: row.viewedPages.length,
      completionPercent: row.completionPercent,
      completed: true,
    }
  },

  async get(actor, materialId) {
    const row = await materialProgressRepository.findByUserAndMaterial(actor.id, materialId)
    if (!row) return { materialId, totalPages: 0, viewedPages: 0, completionPercent: 0, completed: false }
    return {
      materialId,
      totalPages: row.totalPages,
      viewedPages: row.viewedPages.length,
      completionPercent: row.completionPercent,
      completed: Boolean(row.completedAt),
    }
  },
}
