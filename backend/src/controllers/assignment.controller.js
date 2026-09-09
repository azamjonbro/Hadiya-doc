import { assignmentService } from '../services/assignments/assignment.service.js'
import { submissionService } from '../services/assignments/submission.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const assignmentController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await assignmentService.list(req.validatedQuery))
  }),
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await assignmentService.create(req.user, req.body), 'Assignment created', 201)
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await assignmentService.update(req.user, req.params.id, req.body))
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await assignmentService.remove(req.user, req.params.id), 'Assignment deleted')
  }),

  // The learner's side.
  mine: asyncHandler(async (req, res) => {
    sendSuccess(res, await submissionService.mine(req.user, req.params.id))
  }),
  saveDraft: asyncHandler(async (req, res) => {
    sendSuccess(res, await submissionService.save(req.user, req.params.id, req.body), 'Draft saved')
  }),
  submit: asyncHandler(async (req, res) => {
    sendSuccess(res, await submissionService.save(req.user, req.params.id, req.body, { submit: true }), 'Submitted')
  }),

  // The reviewer's side.
  queue: asyncHandler(async (req, res) => {
    sendSuccess(res, await submissionService.queue(req.user, req.validatedQuery))
  }),
  submission: asyncHandler(async (req, res) => {
    sendSuccess(res, await submissionService.detail(req.user, req.params.submissionId))
  }),
  grade: asyncHandler(async (req, res) => {
    sendSuccess(res, await submissionService.grade(req.user, req.params.submissionId, req.body), 'Graded')
  }),

  listRubrics: asyncHandler(async (_req, res) => {
    sendSuccess(res, await assignmentService.listRubrics())
  }),
  createRubric: asyncHandler(async (req, res) => {
    sendSuccess(res, await assignmentService.createRubric(req.user, req.body), 'Rubric created', 201)
  }),
  removeRubric: asyncHandler(async (req, res) => {
    sendSuccess(res, await assignmentService.removeRubric(req.user, req.params.id), 'Rubric deleted')
  }),
}
