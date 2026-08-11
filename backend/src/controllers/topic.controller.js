import { topicService } from '../services/courses/topic.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const topicController = {
  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await topicService.getById(req.user, req.params.id))
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await topicService.update(req.user, req.params.id, req.body), 'Topic updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await topicService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Topic deleted')
  }),
}
