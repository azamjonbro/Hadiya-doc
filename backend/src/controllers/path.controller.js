import { pathService } from '../services/paths/path.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const pathController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await pathService.list(req.user, req.validatedQuery))
  }),
  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await pathService.getById(req.user, req.params.id))
  }),
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await pathService.create(req.user, req.body), 'Path created', 201)
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await pathService.update(req.user, req.params.id, req.body))
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await pathService.remove(req.user, req.params.id), 'Path deleted')
  }),
  enrollSelf: asyncHandler(async (req, res) => {
    sendSuccess(res, await pathService.enrollSelf(req.user, req.params.id), 'Enrolled', 201)
  }),
  assign: asyncHandler(async (req, res) => {
    const { userId, ...options } = req.body
    sendSuccess(res, await pathService.assign(req.user, req.params.id, userId, options), 'Assigned', 201)
  }),
  enrollments: asyncHandler(async (req, res) => {
    sendSuccess(res, await pathService.enrollments(req.params.id, { scopedUserIds: req.scopedUserIds ?? null }))
  }),
}
