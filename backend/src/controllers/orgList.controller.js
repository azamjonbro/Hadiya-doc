import { orgListService } from '../services/org/orgList.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const orgListController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await orgListService.list(req.params.type))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await orgListService.create(req.user, req.params.type, req.body.name, { code: req.body.code, headId: req.body.headId }), 'Entry created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await orgListService.update(req.user, req.params.type, req.params.id, req.body), 'Entry updated')
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await orgListService.remove(req.user, req.params.type, req.params.id), 'Entry deleted')
  }),
}
