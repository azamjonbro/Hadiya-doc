import { branchService } from '../services/branches/branch.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const branchController = {
  overview: asyncHandler(async (req, res) => {
    sendSuccess(res, await branchService.overview())
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await branchService.create(req.user, req.body.name), 'Branch created', 201)
  }),

  rename: asyncHandler(async (req, res) => {
    sendSuccess(res, await branchService.rename(req.user, req.params.id, req.body.name), 'Branch renamed')
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await branchService.remove(req.user, req.params.id), 'Branch deleted')
  }),
}
