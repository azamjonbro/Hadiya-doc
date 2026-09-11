import { courseQuestionService } from '../services/courses/courseQuestion.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const courseQuestionController = {
  summary: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseQuestionService.summary(req.user))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseQuestionService.create(req.user, req.params.id, req.body), 'Question posted', 201)
  }),

  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseQuestionService.list(req.user, req.params.id, req.validatedQuery))
  }),

  answer: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseQuestionService.answer(req.user, req.params.id, req.params.questionId, req.body), 'Answer posted', 201)
  }),

  remove: asyncHandler(async (req, res) => {
    await courseQuestionService.remove(req.user, req.params.id, req.params.questionId)
    sendSuccess(res, null, 'Question deleted')
  }),
}
