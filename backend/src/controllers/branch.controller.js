import { branchService } from '../services/branches/branch.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const branchController = {
  overview: asyncHandler(async (req, res) => {
    sendSuccess(res, await branchService.overview())
  }),

  tree: asyncHandler(async (req, res) => {
    sendSuccess(res, await branchService.tree())
  }),

  create: asyncHandler(async (req, res) => {
    const { name, code, headId } = req.body
    sendSuccess(res, await branchService.create(req.user, name, { code, headId }), 'Branch created', 201)
  }),

  rename: asyncHandler(async (req, res) => {
    const { name, code, headId } = req.body
    sendSuccess(res, await branchService.rename(req.user, req.params.id, name, { code, headId }), 'Branch renamed')
  }),

  // `?force=1` means the caller has already been told what is attached and
  // said yes anyway; without it the service refuses a branch still in use.
  remove: asyncHandler(async (req, res) => {
    const { force } = req.validatedQuery
    sendSuccess(res, await branchService.remove(req.user, { id: req.params.id, force }), 'Branch deleted')
  }),

  removeByName: asyncHandler(async (req, res) => {
    const { name, force } = req.validatedQuery
    sendSuccess(res, await branchService.remove(req.user, { name, force }), 'Branch deleted')
  }),
}
