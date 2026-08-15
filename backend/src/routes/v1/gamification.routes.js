import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { gamificationController } from '../../controllers/gamification.controller.js'
import { leaderboardQuerySchema } from '../../validators/group.validator.js'

export const gamificationRouter = Router()

gamificationRouter.use(authenticate)

gamificationRouter.get('/me', gamificationController.getMySummary)
gamificationRouter.get('/leaderboard', validateQuery(leaderboardQuerySchema), gamificationController.getLeaderboard)
