import { topicContentService } from '../services/courses/topicContent.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const topicContentController = {
  get: asyncHandler(async (req, res) => {
    sendSuccess(res, await topicContentService.getContent(req.user, req.params.id))
  }),
}
