import { facePolicyService } from '../services/face/facePolicy.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const facePolicyController = {
  getGlobal: asyncHandler(async (req, res) => {
    sendSuccess(res, await facePolicyService.getGlobal())
  }),

  updateGlobal: asyncHandler(async (req, res) => {
    sendSuccess(res, await facePolicyService.updateGlobal(req.user, req.body), 'Face verification policy updated')
  }),
}
