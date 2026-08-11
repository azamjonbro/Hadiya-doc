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

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.create(req.user, req.body), 'Course created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.update(req.user, req.params.id, req.body), 'Course updated')
  }),

  archive: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseService.archive(req.user, req.params.id), 'Course archived')
  }),

  listTopics: asyncHandler(async (req, res) => {
    sendSuccess(res, await topicService.listByCourse(req.user, req.params.id))
  }),

  createTopic: asyncHandler(async (req, res) => {
    sendSuccess(res, await topicService.create(req.user, req.params.id, req.body), 'Topic created', 201)
  }),
}
