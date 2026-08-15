import { quizService } from '../services/quizzes/quiz.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const quizController = {
  getForVideo: asyncHandler(async (req, res) => {
    sendSuccess(res, await quizService.getForVideo(req.user, req.params.id))
  }),

  upsert: asyncHandler(async (req, res) => {
    sendSuccess(res, await quizService.upsert(req.user, req.params.id, req.body), 'Quiz saved')
  }),

  remove: asyncHandler(async (req, res) => {
    await quizService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Quiz deleted')
  }),

  submit: asyncHandler(async (req, res) => {
    sendSuccess(res, await quizService.submit(req.user, req.params.id, req.body.answers), 'Quiz submitted')
  }),

  getAttemptsForUser: asyncHandler(async (req, res) => {
    sendSuccess(res, await quizService.getAttemptsForUser(req.user, req.params.id, req.params.userId))
  }),
}
