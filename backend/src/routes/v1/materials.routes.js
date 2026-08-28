import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { materialDownloadRateLimiter } from '../../middlewares/materialRateLimit.middleware.js'
import { materialController } from '../../controllers/material.controller.js'
import { materialAccessController } from '../../controllers/materialAccess.controller.js'
import {
  updateMaterialSchema,
  materialUrlQuerySchema,
  materialPageSchema,
} from '../../validators/material.validator.js'

export const materialsRouter = Router()

materialsRouter.use(authenticate)

materialsRouter.get('/:id', requirePermission(PERMISSIONS.VIDEO_VIEW), materialController.getById)
materialsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.VIDEO_MANAGE),
  validateBody(updateMaterialSchema),
  materialController.update
)
materialsRouter.delete('/:id', requirePermission(PERMISSIONS.VIDEO_MANAGE), materialController.remove)
materialsRouter.get(
  '/:id/download-url',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  materialDownloadRateLimiter,
  validateQuery(materialUrlQuerySchema),
  materialAccessController.getDownloadUrl
)
materialsRouter.get(
  '/:id/content',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  materialDownloadRateLimiter,
  materialAccessController.streamContent
)

// Reading progress. Both are about the caller's own record, so they ride on
// the same view permission the material itself does — there is nothing here
// an employee could use to see or change anyone else's.
materialsRouter.get('/:id/progress', requirePermission(PERMISSIONS.VIDEO_VIEW), materialAccessController.progress)
materialsRouter.post(
  '/:id/progress',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  validateBody(materialPageSchema),
  materialAccessController.recordPage
)
materialsRouter.post(
  '/:id/progress/complete',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  materialAccessController.markComplete
)
