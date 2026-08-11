import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { videoTokenRateLimiter } from '../../middlewares/videoStreamRateLimit.middleware.js'
import { videoAccessController } from '../../controllers/videoAccess.controller.js'

export const videoAccessRouter = Router()

videoAccessRouter.post(
  '/:videoId/token',
  authenticate,
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  videoTokenRateLimiter,
  videoAccessController.issueToken
)
