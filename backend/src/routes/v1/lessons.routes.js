import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { lessonController } from '../../controllers/lesson.controller.js'
import { updateLessonSchema, lessonProgressSchema } from '../../validators/lesson.validator.js'

export const lessonsRouter = Router()

lessonsRouter.use(authenticate)

lessonsRouter.get('/:id', requirePermission(PERMISSIONS.VIDEO_VIEW), lessonController.getById)

// course:update, not video:manage. A lesson is written text rather than an
// uploaded file: what it needs is the permission to change the course's
// content, which is also the permission that reorders a topic (9.1).
lessonsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateLessonSchema),
  lessonController.update
)
lessonsRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_UPDATE), lessonController.remove)

// Reading progress. All three are about the caller's own record, so they
// ride on the same view permission the lesson itself does — exactly as the
// material progress endpoints do.
lessonsRouter.get('/:id/progress', requirePermission(PERMISSIONS.VIDEO_VIEW), lessonController.progress)
lessonsRouter.post(
  '/:id/progress',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  validateBody(lessonProgressSchema),
  lessonController.recordBlocks
)
lessonsRouter.post(
  '/:id/progress/complete',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  lessonController.markComplete
)
