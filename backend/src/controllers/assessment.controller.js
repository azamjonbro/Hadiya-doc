import { assessmentService } from '../services/assessments/assessment.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const assessmentController = {
  listByTopic: asyncHandler(async (req, res) => {
    sendSuccess(res, await assessmentService.listByTopic(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await assessmentService.create(req.user, req.params.id, req.body), 'Assessment created', 201)
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await assessmentService.getById(req.user, req.params.id))
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await assessmentService.update(req.user, req.params.id, req.body), 'Assessment updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await assessmentService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Assessment deleted')
  }),

  start: asyncHandler(async (req, res) => {
    sendSuccess(res, await assessmentService.start(req.user, req.params.id), 'Assessment started', 201)
  }),

  reportFocusLoss: asyncHandler(async (req, res) => {
    sendSuccess(res, await assessmentService.reportFocusLoss(req.user, req.params.id, req.body.answers))
  }),

  submit: asyncHandler(async (req, res) => {
    sendSuccess(res, await assessmentService.submit(req.user, req.params.id, req.body.answers), 'Assessment submitted')
  }),
}
