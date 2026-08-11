import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { videoAnalyticsController } from '../../controllers/videoAnalytics.controller.js'

export const videoAnalyticsRouter = Router()

videoAnalyticsRouter.use(authenticate)

videoAnalyticsRouter.get(
  '/:videoId/users/:userId/report',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  videoAnalyticsController.getUserReport
)
