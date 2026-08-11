import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { videoController } from '../../controllers/video.controller.js'
import { updateVideoSchema } from '../../validators/video.validator.js'

export const videosRouter = Router()

videosRouter.use(authenticate)

videosRouter.get('/:id', requirePermission(PERMISSIONS.VIDEO_VIEW), videoController.getById)
videosRouter.get('/:id/status', requirePermission(PERMISSIONS.VIDEO_VIEW), videoController.getStatus)
videosRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.VIDEO_MANAGE),
  validateBody(updateVideoSchema),
  videoController.update
)
videosRouter.delete('/:id', requirePermission(PERMISSIONS.VIDEO_MANAGE), videoController.remove)
