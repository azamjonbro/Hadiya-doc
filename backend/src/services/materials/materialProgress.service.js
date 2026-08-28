import { materialProgressRepository } from '../../repositories/materialProgress.repository.js'
import { materialRepository } from '../../repositories/material.repository.js'
import { ApiError } from '../../utils/ApiError.js'

// A document with more pages than this is almost certainly a viewer bug
// rather than a real deck, and an inflated denominator would silently peg
// everyone's progress near zero.
const MAX_PAGES = 5000

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

    await materialProgressRepository.save(row)

    return {
      materialId,
      totalPages: row.totalPages,
      viewedPages: row.viewedPages.length,
      completionPercent: row.completionPercent,
      completed: Boolean(row.completedAt),
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
