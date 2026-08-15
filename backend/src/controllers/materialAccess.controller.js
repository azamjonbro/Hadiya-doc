import { materialAccessService } from '../services/materials/materialAccess.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const materialAccessController = {
  getDownloadUrl: asyncHandler(async (req, res) => {
    sendSuccess(res, await materialAccessService.getDownloadUrl(req.user, req.params.id))
  }),
}
