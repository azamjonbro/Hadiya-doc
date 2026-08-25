import { Router } from 'express'
import multer from 'multer'
import { ROLES } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/rbac.middleware.js'
import { authenticateOrFaceChallenge } from '../../middlewares/authenticateOrFaceChallenge.middleware.js'
import { imageUploadRateLimiter } from '../../middlewares/imageUploadRateLimit.middleware.js'
import { faceVerifyRateLimiter } from '../../middlewares/faceVerifyRateLimit.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { faceSetEnabledBodySchema } from '../../validators/face.validator.js'
import { faceController } from '../../controllers/face.controller.js'
import { ApiError } from '../../utils/ApiError.js'

export const faceRouter = Router()

// 3MB covers a full-resolution phone-camera enrollment photo with room to
// spare; the service caps it again after magic-byte validation.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } })

function uploadPhotos(fieldName, maxCount) {
  const handler = maxCount > 1 ? upload.array(fieldName, maxCount) : upload.single(fieldName)
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) {
        next()
        return
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(ApiError.badRequest('Photo must be 3MB or smaller', 'FILE_TOO_LARGE'))
        return
      }
      next(ApiError.badRequest('Invalid upload', 'UPLOAD_ERROR'))
    })
  }
}

// Only SUPERADMIN enrolls or re-enrolls a reference face (spec §16) — a
// role check rather than a permission, so it stays SUPERADMIN-only even if
// a custom role is later handed every other user-management permission.
faceRouter.post(
  '/enroll',
  authenticate,
  requireRole(ROLES.SUPERADMIN),
  imageUploadRateLimiter,
  uploadPhotos('photos', 3),
  faceController.enroll
)
faceRouter.post(
  '/re-enroll',
  authenticate,
  requireRole(ROLES.SUPERADMIN),
  imageUploadRateLimiter,
  uploadPhotos('photos', 3),
  faceController.reEnroll
)

// The one route usable both mid-login (challenge token, no session yet) and
// with a normal session (the daily video-playback gate) — see
// authenticateOrFaceChallenge.middleware.js.
faceRouter.post(
  '/verify',
  faceVerifyRateLimiter,
  uploadPhotos('photo', 1),
  authenticateOrFaceChallenge,
  faceController.verify
)

// Self status check — any authenticated role, no special permission: it's
// your own face-verification state.
faceRouter.get('/status', authenticate, faceController.status)

// SUPERADMIN checking someone else's status, from the admin panel.
faceRouter.get('/status/:userId', authenticate, requireRole(ROLES.SUPERADMIN), faceController.statusForUser)

faceRouter.patch(
  '/:userId',
  authenticate,
  requireRole(ROLES.SUPERADMIN),
  validateBody(faceSetEnabledBodySchema),
  faceController.setEnabled
)

faceRouter.get(
  '/:userId/reference-image',
  authenticate,
  requireRole(ROLES.SUPERADMIN),
  faceController.referenceImage
)
