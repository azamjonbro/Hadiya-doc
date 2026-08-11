import { videoAccessService } from '../services/videos/videoAccess.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const videoAccessController = {
  issueToken: asyncHandler(async (req, res) => {
    const result = await videoAccessService.issueToken(req.user, req.params.videoId)
    sendSuccess(res, result)
  }),
}
