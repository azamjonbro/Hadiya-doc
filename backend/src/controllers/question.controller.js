import { questionService } from '../services/questions/question.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const questionController = {
  listBanks: asyncHandler(async (req, res) => {
    sendSuccess(res, await questionService.listBanks(req.query))
  }),
  createBank: asyncHandler(async (req, res) => {
    sendSuccess(res, await questionService.createBank(req.user, req.body), 'Bank created', 201)
  }),
  updateBank: asyncHandler(async (req, res) => {
    sendSuccess(res, await questionService.updateBank(req.user, req.params.id, req.body))
  }),
  deleteBank: asyncHandler(async (req, res) => {
    sendSuccess(res, await questionService.deleteBank(req.user, req.params.id), 'Bank deleted')
  }),

  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await questionService.listQuestions(req.validatedQuery))
  }),
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await questionService.createQuestion(req.user, req.body), 'Question created', 201)
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await questionService.updateQuestion(req.user, req.params.id, req.body))
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await questionService.deleteQuestion(req.user, req.params.id), 'Question deleted')
  }),
}
