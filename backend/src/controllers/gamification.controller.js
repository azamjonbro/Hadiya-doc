import { pointsService } from '../services/gamification/points.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const gamificationController = {
  getMySummary: asyncHandler(async (req, res) => {
    sendSuccess(res, await pointsService.getSummary(req.user.id))
  }),

  getLeaderboard: asyncHandler(async (req, res) => {
    sendSuccess(res, await pointsService.getLeaderboard(req.user, req.validatedQuery))
  }),
}
