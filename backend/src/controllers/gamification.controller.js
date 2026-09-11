import { pointsService } from '../services/gamification/points.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { badgeService } from '../services/gamification/badge.service.js'

export const gamificationController = {
  getMySummary: asyncHandler(async (req, res) => {
    sendSuccess(res, await pointsService.getSummary(req.user.id))
  }),

  getMyPoints: asyncHandler(async (req, res) => {
    sendSuccess(res, await pointsService.getHistory(req.user.id))
  }),

  getLeaderboard: asyncHandler(async (req, res) => {
    sendSuccess(res, await pointsService.getLeaderboard(req.user, req.validatedQuery))
  }),

  // What this person holds, newest first.
  myBadges: asyncHandler(async (req, res) => {
    sendSuccess(res, await badgeService.listFor(req.user.id))
  }),

  // The catalog, with how close they are to each — "3 of 5 quizzes" is a
  // reason to take a fourth, which a plain list of locked icons is not.
  badgeCatalog: asyncHandler(async (req, res) => {
    sendSuccess(res, await badgeService.catalogFor(req.user.id))
  }),
}
