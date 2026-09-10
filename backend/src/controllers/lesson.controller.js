import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { lessonService } from '../services/courses/lesson.service.js'
import { lessonProgressService } from '../services/courses/lessonProgress.service.js'

export const lessonController = {
  listByTopic: asyncHandler(async (req, res) => {
    sendSuccess(res, await lessonService.listByTopic(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await lessonService.create(req.user, req.params.id, req.body), 'Lesson created', 201)
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await lessonService.getById(req.user, req.params.id))
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await lessonService.update(req.user, req.params.id, req.body), 'Lesson updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await lessonService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Lesson deleted')
  }),

  progress: asyncHandler(async (req, res) => {
    sendSuccess(res, await lessonProgressService.get(req.user, req.params.id))
  }),

  recordBlocks: asyncHandler(async (req, res) => {
    sendSuccess(res, await lessonProgressService.recordBlocks(req.user, req.params.id, req.body.blockIds))
  }),

  markComplete: asyncHandler(async (req, res) => {
    sendSuccess(res, await lessonProgressService.markComplete(req.user, req.params.id), 'Lesson completed')
  }),
}
