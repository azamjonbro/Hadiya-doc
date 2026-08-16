import { Router } from 'express'
import multer from 'multer'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { imageUploadRateLimiter } from '../../middlewares/imageUploadRateLimit.middleware.js'
import { proctorController } from '../../controllers/proctor.controller.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { listSnapshotsQuerySchema } from '../../validators/proctor.validator.js'
import { ApiError } from '../../utils/ApiError.js'

export const proctorRouter = Router()

// 1MB is already generous for a 320x240 JPEG; the service caps it again at
// 512KB after magic-byte validation.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } })

function uploadSnapshot(req, res, next) {
  upload.single('snapshot')(req, res, (err) => {
    if (!err) {
      next()
      return
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(ApiError.badRequest('Snapshot must be 1MB or smaller', 'FILE_TOO_LARGE'))
      return
    }
    next(ApiError.badRequest('Invalid upload', 'UPLOAD_ERROR'))
  })
}

proctorRouter.use(authenticate)

// Written by the learner's own player, so it is gated on watching rather than
// on any admin permission — and rate limited, because it is an authenticated
// write that a tampered client could otherwise call in a loop.
proctorRouter.post(
  '/videos/:videoId/snapshots',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  imageUploadRateLimiter,
  uploadSnapshot,
  proctorController.capture
)

// Everything below is for whoever reviews the alerts.
proctorRouter.get(
  '/snapshots',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  validateQuery(listSnapshotsQuerySchema),
  proctorController.list
)

proctorRouter.get(
  '/snapshots/:id/image',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  proctorController.image
)

proctorRouter.patch(
  '/snapshots/:id/reviewed',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  proctorController.markReviewed
)
