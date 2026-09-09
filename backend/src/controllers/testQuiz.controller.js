import { testQuizService } from '../services/quizzes/testQuiz.service.js'
import { quizResultService } from '../services/quizzes/quizResult.service.js'
import { testQuizAdminService } from '../services/quizzes/testQuizAdmin.service.js'
import { quizStatsService } from '../services/quizzes/quizStats.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const testQuizController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await testQuizAdminService.list(req.validatedQuery))
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await testQuizAdminService.getById(req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await testQuizAdminService.create(req.user, req.body), 'Test created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await testQuizAdminService.update(req.user, req.params.id, req.body))
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await testQuizAdminService.remove(req.user, req.params.id), 'Test deleted')
  }),

  stats: asyncHandler(async (req, res) => {
    sendSuccess(res, await quizStatsService.forQuiz(req.params.id))
  }),

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
