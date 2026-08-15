import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { videoController } from '../../controllers/video.controller.js'
import { quizController } from '../../controllers/quiz.controller.js'
import { updateVideoSchema } from '../../validators/video.validator.js'
import { upsertQuizSchema, submitQuizSchema } from '../../validators/quiz.validator.js'

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

videosRouter.get('/:id/quiz', requirePermission(PERMISSIONS.VIDEO_VIEW), quizController.getForVideo)
videosRouter.put(
  '/:id/quiz',
  requirePermission(PERMISSIONS.VIDEO_MANAGE),
  validateBody(upsertQuizSchema),
  quizController.upsert
)
videosRouter.delete('/:id/quiz', requirePermission(PERMISSIONS.VIDEO_MANAGE), quizController.remove)
videosRouter.post(
  '/:id/quiz/submit',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  validateBody(submitQuizSchema),
  quizController.submit
)
videosRouter.get(
  '/:id/quiz/attempts/:userId',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  quizController.getAttemptsForUser
)
