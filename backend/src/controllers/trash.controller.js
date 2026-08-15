import { trashService } from '../services/trash/trash.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const trashController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await trashService.list(req.user))
  }),

  restore: asyncHandler(async (req, res) => {
    sendSuccess(res, await trashService.restore(req.user, req.params.type, req.params.id), 'Restored')
  }),

  destroy: asyncHandler(async (req, res) => {
    sendSuccess(res, await trashService.destroy(req.user, req.params.type, req.params.id), 'Permanently deleted')
  }),
}
