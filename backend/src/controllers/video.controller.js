import { videoService } from '../services/videos/video.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const videoController = {
  listByTopic: asyncHandler(async (req, res) => {
    sendSuccess(res, await videoService.listByTopic(req.user, req.params.id))
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await videoService.getById(req.user, req.params.id))
  }),

  getStatus: asyncHandler(async (req, res) => {
    sendSuccess(res, await videoService.getStatus(req.user, req.params.id))
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await videoService.update(req.user, req.params.id, req.body), 'Video updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await videoService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Video deleted')
  }),
}
