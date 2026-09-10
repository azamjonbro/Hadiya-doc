import { Router } from 'express'
import { PERMISSIONS, ROLES } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireRole } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { mediaController } from '../../controllers/media.controller.js'
import { mediaListSchema, updateMediaSchema, cleanupQuerySchema } from '../../validators/media.validator.js'

export const mediaRouter = Router()

mediaRouter.use(authenticate)

// Reading the library is for whoever can put an image somewhere — the same
// people who edit courses, news and lessons. `course:update` is that key
// (the lesson editor and the topic reorder use it too).
mediaRouter.get('/', requirePermission(PERMISSIONS.COURSE_UPDATE), validateQuery(mediaListSchema), mediaController.list)
mediaRouter.get('/folders', requirePermission(PERMISSIONS.COURSE_UPDATE), mediaController.folders)
mediaRouter.get('/:id/usage', requirePermission(PERMISSIONS.COURSE_UPDATE), mediaController.usage)
mediaRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateMediaSchema),
  mediaController.update
)
mediaRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_UPDATE), mediaController.remove)

// The sweep is the one call that deletes objects nobody asked about, so it
// stays with the role rather than with a permission that could be handed
// to a custom role — the same rule the permanent course delete follows.
mediaRouter.post(
  '/cleanup',
  requireRole(ROLES.SUPERADMIN),
  validateQuery(cleanupQuerySchema),
  mediaController.cleanup
)
