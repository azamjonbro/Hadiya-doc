import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { videoController } from '../../controllers/video.controller.js'
import { quizController } from '../../controllers/quiz.controller.js'
import multer from 'multer'
import { updateVideoSchema, addSubtitleSchema } from '../../validators/video.validator.js'
import { ApiError } from '../../utils/ApiError.js'
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

/**
 * Caption tracks (9.4).
 *
 * Reading them needs only `video:view` — a learner's player asks for the
 * list to build its `<track>` elements. Changing them is `video:manage`,
 * the same key that publishes or deletes the video.
 */
const subtitleUpload = multer({
  storage: multer.memoryStorage(),
  // A caption file for a two-hour lecture is a few hundred kilobytes.
  limits: { fileSize: 10 * 1024 * 1024 },
})

function uploadSingleSubtitle(req, res, next) {
  subtitleUpload.single('file')(req, res, (err) => {
    if (!err) {
      next()
      return
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(ApiError.badRequest('Subtitle file must be 10MB or smaller', 'FILE_TOO_LARGE', { limit: 10 }))
      return
    }
    next(ApiError.badRequest('Invalid upload', 'UPLOAD_ERROR'))
  })
}

videosRouter.get('/:id/subtitles', requirePermission(PERMISSIONS.VIDEO_VIEW), videoController.listSubtitles)
videosRouter.post(
  '/:id/subtitles',
  requirePermission(PERMISSIONS.VIDEO_MANAGE),
  uploadSingleSubtitle,
  validateBody(addSubtitleSchema),
  videoController.addSubtitle
)
videosRouter.patch(
  '/:id/subtitles/:trackId/default',
  requirePermission(PERMISSIONS.VIDEO_MANAGE),
  videoController.setDefaultSubtitle
)
videosRouter.delete(
  '/:id/subtitles/:trackId',
  requirePermission(PERMISSIONS.VIDEO_MANAGE),
  videoController.removeSubtitle
)

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
