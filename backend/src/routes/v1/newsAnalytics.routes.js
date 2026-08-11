import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { analyticsIngestRateLimiter } from '../../middlewares/analyticsRateLimit.middleware.js'
import { newsAnalyticsController } from '../../controllers/newsAnalytics.controller.js'
import { newsEventsBatchSchema } from '../../validators/newsAnalytics.validator.js'

export const newsAnalyticsRouter = Router()

newsAnalyticsRouter.use(authenticate)

newsAnalyticsRouter.post(
  '/:id/events',
  analyticsIngestRateLimiter,
  validateBody(newsEventsBatchSchema),
  newsAnalyticsController.ingestEvents
)
newsAnalyticsRouter.get('/:id/report', newsAnalyticsController.getOwnReport)
newsAnalyticsRouter.get(
  '/:id/users/:userId/report',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  newsAnalyticsController.getUserReport
)
