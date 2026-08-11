import { aiChatService } from '../services/ai/aiChat.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const aiChatController = {
  sendMessage: asyncHandler(async (req, res) => {
    sendSuccess(res, await aiChatService.sendMessage(req.user, req.body), 'Message sent')
  }),

  getHistory: asyncHandler(async (req, res) => {
    sendSuccess(res, await aiChatService.getHistory(req.user, req.validatedQuery))
  }),
}
