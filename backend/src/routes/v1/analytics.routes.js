import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { analyticsIngestRateLimiter } from '../../middlewares/analyticsRateLimit.middleware.js'
import { videoAnalyticsController } from '../../controllers/videoAnalytics.controller.js'
import { videoEventsBatchSchema } from '../../validators/analytics.validator.js'

export const analyticsRouter = Router()

analyticsRouter.use(authenticate)

analyticsRouter.post(
  '/video/events',
  analyticsIngestRateLimiter,
  validateBody(videoEventsBatchSchema),
  videoAnalyticsController.ingestEvents
)
analyticsRouter.get('/video/:videoId/report', videoAnalyticsController.getOwnReport)
