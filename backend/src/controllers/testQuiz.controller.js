import { testQuizService } from '../services/quizzes/testQuiz.service.js'
import { quizResultService } from '../services/quizzes/quizResult.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const testQuizController = {
  start: asyncHandler(async (req, res) => {
    sendSuccess(res, await testQuizService.start(req.user, req.params.id))
  }),

  submit: asyncHandler(async (req, res) => {
    const { sessionId, answers } = req.body
    sendSuccess(res, await testQuizService.submit(req.user, sessionId, answers), 'Submitted')
  }),

  summary: asyncHandler(async (req, res) => {
    sendSuccess(res, await quizResultService.summaryFor(req.user.id, req.params.id))
  }),

  review: asyncHandler(async (req, res) => {
    sendSuccess(res, await quizResultService.reviewFor(req.user, req.params.attemptId))
  }),

  focusLoss: asyncHandler(async (req, res) => {
    sendSuccess(res, await testQuizService.reportFocusLoss(req.user, req.params.sessionId))
  }),
}
