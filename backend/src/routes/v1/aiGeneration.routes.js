import { Router } from 'express'
import multer from 'multer'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { aiGenerationController } from '../../controllers/aiGeneration.controller.js'
import { outlineRequestSchema, quizRequestSchema } from '../../validators/aiGeneration.validator.js'
import { ApiError } from '../../utils/ApiError.js'

export const aiGenerationRouter = Router()

aiGenerationRouter.use(authenticate)

/**
 * A source document is read in memory and never stored: the text goes into
 * one prompt and the file has no second reader. 40 MB covers a long
 * illustrated manual — the *text* ceiling that matters is in
 * sourceExtract.service.js.
 */
const sourceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } })

function uploadSingleSource(req, res, next) {
  sourceUpload.single('file')(req, res, (err) => {
    if (!err) {
      next()
      return
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(ApiError.badRequest('The document must be 40MB or smaller', 'FILE_TOO_LARGE', { limit: 40 }))
      return
    }
    next(ApiError.badRequest('Invalid upload', 'UPLOAD_ERROR'))
  })
}

// course:create, not course:update: this makes a whole course, which is the
// same authority as creating one by hand.
aiGenerationRouter.post(
  '/course-outline',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  uploadSingleSource,
  validateBody(outlineRequestSchema),
  aiGenerationController.outline
)

// quiz:configure, not course:create: writing questions is the assessment
// author's job, and the two are separate keys precisely because they are
// often separate people (2.4).
aiGenerationRouter.post(
  '/quiz',
  requirePermission(PERMISSIONS.QUIZ_CONFIGURE),
  uploadSingleSource,
  validateBody(quizRequestSchema),
  aiGenerationController.quiz
)

aiGenerationRouter.get('/jobs', requirePermission(PERMISSIONS.COURSE_CREATE), aiGenerationController.list)
aiGenerationRouter.get('/jobs/:id', requirePermission(PERMISSIONS.COURSE_CREATE), aiGenerationController.get)
// What the month has cost so far. Readable by anyone who can generate —
// the ceiling is the reason a request may be refused, so the number that
// explains the refusal should not need an administrator.
aiGenerationRouter.get('/usage', requirePermission(PERMISSIONS.COURSE_CREATE), aiGenerationController.usage)
