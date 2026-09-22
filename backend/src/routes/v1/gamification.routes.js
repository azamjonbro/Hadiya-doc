import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { gamificationController } from '../../controllers/gamification.controller.js'
import { leaderboardQuerySchema } from '../../validators/group.validator.js'

export const gamificationRouter = Router()

gamificationRouter.use(authenticate)

gamificationRouter.get('/me', gamificationController.getMySummary)
gamificationRouter.get('/me/points', gamificationController.getMyPoints)
gamificationRouter.get('/leaderboard', validateQuery(leaderboardQuerySchema), gamificationController.getLeaderboard)
gamificationRouter.get('/badges', gamificationController.myBadges)
// Somebody else's — the achievements tab on an employee's profile.
gamificationRouter.get('/users/:userId/points', requirePermission(PERMISSIONS.USER_READ), gamificationController.userPoints)
gamificationRouter.get('/users/:userId/badges', requirePermission(PERMISSIONS.USER_READ), gamificationController.userBadges)
gamificationRouter.get('/badges/catalog', gamificationController.badgeCatalog)
