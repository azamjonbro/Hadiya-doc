import { courseCategoryService } from '../services/courses/courseCategory.service.js'
import { ContentTranslation } from '../models/contentTranslation.model.js'
import { courseRepository } from '../repositories/course.repository.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const courseCategoryController = {
  list: asyncHandler(async (_req, res) => {
    sendSuccess(res, await courseCategoryService.list())
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseCategoryService.create(req.user, req.body), 'Category created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseCategoryService.update(req.user, req.params.id, req.body))
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseCategoryService.remove(req.user, req.params.id), 'Category deleted')
  }),

  // The tag filter's options: what is actually in use, not a curated list.
  // Tags are free text by design, so the only honest source is the courses.
  tags: asyncHandler(async (_req, res) => {
    sendSuccess(res, { tags: await courseRepository.listTags() })
  }),

  // Which courses can be read in which other language — approved
  // translations only, since a draft one is not served to learners. The
  // library's «courses in other languages» panel is drawn from this.
  languages: asyncHandler(async (_req, res) => {
    const rows = await ContentTranslation.aggregate([
      { $match: { entity: 'Course', status: 'APPROVED' } },
      { $group: { _id: '$entityId', langs: { $addToSet: '$lang' } } },
    ])
    sendSuccess(res, { items: rows.map((row) => ({ courseId: String(row._id), langs: row.langs.sort() })) })
  }),
}
