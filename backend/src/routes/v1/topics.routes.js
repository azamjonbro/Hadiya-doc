import { Router } from 'express'
import multer from 'multer'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { materialUploadRateLimiter } from '../../middlewares/materialRateLimit.middleware.js'
import { topicController } from '../../controllers/topic.controller.js'
import { videoController } from '../../controllers/video.controller.js'
import { materialController } from '../../controllers/material.controller.js'
import { assessmentController } from '../../controllers/assessment.controller.js'
import { topicContentController } from '../../controllers/topicContent.controller.js'
import { lessonController } from '../../controllers/lesson.controller.js'
import { updateTopicSchema, reorderContentSchema } from '../../validators/course.validator.js'
import { createMaterialMetaSchema } from '../../validators/material.validator.js'
import { createAssessmentSchema } from '../../validators/assessment.validator.js'
import { createLessonSchema } from '../../validators/lesson.validator.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'

export const topicsRouter = Router()

topicsRouter.use(authenticate)

// Memory storage — files are re-validated by magic bytes and re-uploaded to
// S3 in materialUpload.service.js, same reasoning as uploads.routes.js.
const materialUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MATERIAL_MAX_FILE_SIZE_MB * 1024 * 1024 },
})

function uploadSingleMaterial(req, res, next) {
  materialUpload.single('file')(req, res, (err) => {
    if (!err) {
      next()
      return
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(
        ApiError.badRequest(
          `File must be ${env.MATERIAL_MAX_FILE_SIZE_MB}MB or smaller`,
          'FILE_TOO_LARGE',
          { limit: env.MATERIAL_MAX_FILE_SIZE_MB }
        )
      )
      return
    }
    next(ApiError.badRequest('Invalid upload', 'UPLOAD_ERROR'))
  })
}

topicsRouter.get('/:id', requirePermission(PERMISSIONS.COURSE_READ), topicController.getById)
topicsRouter.get('/:id/content', requirePermission(PERMISSIONS.VIDEO_VIEW), topicContentController.get)
// One sequence across four collections (9.1). course:update, not
// video:manage: the order of a curriculum is the course's shape, not any one
// item's setting.
topicsRouter.patch(
  '/:id/content/order',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(reorderContentSchema),
  topicContentController.reorder
)
topicsRouter.get('/:id/videos', requirePermission(PERMISSIONS.VIDEO_VIEW), videoController.listByTopic)

topicsRouter.get('/:id/materials', requirePermission(PERMISSIONS.VIDEO_VIEW), materialController.listByTopic)
topicsRouter.post(
  '/:id/materials',
  requirePermission(PERMISSIONS.VIDEO_UPLOAD),
  materialUploadRateLimiter,
  uploadSingleMaterial,
  validateBody(createMaterialMetaSchema),
  materialController.create
)

topicsRouter.get('/:id/assessments', requirePermission(PERMISSIONS.VIDEO_VIEW), assessmentController.listByTopic)
topicsRouter.post(
  '/:id/assessments',
  requirePermission(PERMISSIONS.VIDEO_MANAGE),
  validateBody(createAssessmentSchema),
  assessmentController.create
)

topicsRouter.get('/:id/lessons', requirePermission(PERMISSIONS.VIDEO_VIEW), lessonController.listByTopic)
topicsRouter.post(
  '/:id/lessons',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(createLessonSchema),
  lessonController.create
)

topicsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateTopicSchema),
  topicController.update
)
topicsRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_DELETE), topicController.remove)
