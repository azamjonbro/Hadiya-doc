import { courseService } from '../services/courses/course.service.js'
import { topicService } from '../services/courses/topic.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const courseController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.list(req.user, req.validatedQuery))
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.getById(req.user, req.params.id))
  }),

  getMyProgress: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.getMyProgress(req.user, req.params.id))
  }),

  getProgressForUser: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.getProgressForUser(req.user, req.params.id, req.params.userId))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.create(req.user, req.body), 'Course created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.update(req.user, req.params.id, req.body), 'Course updated')
  }),

  archive: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.archive(req.user, req.params.id), 'Course archived')
  }),

  moveToTrash: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.moveToTrash(req.user, req.params.id), 'Course moved to trash')
  }),

  listTrash: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.listTrash())
  }),

  restore: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.restore(req.user, req.params.id), 'Course restored')
  }),

  destroy: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.destroy(req.user, req.params.id), 'Course permanently deleted')
  }),

  listTopics: asyncHandler(async (req, res) => {
    sendSuccess(res, await topicService.listByCourse(req.user, req.params.id))
  }),

  createTopic: asyncHandler(async (req, res) => {
    sendSuccess(res, await topicService.create(req.user, req.params.id, req.body), 'Topic created', 201)
  }),
}
