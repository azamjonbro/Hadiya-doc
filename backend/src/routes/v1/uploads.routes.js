import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { imageUploadRateLimiter } from '../../middlewares/imageUploadRateLimit.middleware.js'
import { uploadController } from '../../controllers/upload.controller.js'
import { ApiError } from '../../utils/ApiError.js'

export const uploadsRouter = Router()

// Memory storage — files are small (5MB cap) and immediately re-validated
// by magic bytes and re-uploaded to S3 in imageUpload.service.js, so
// there's no reason to touch local disk first.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

function uploadSingleImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) {
      next()
      return
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(ApiError.badRequest('Image must be 5MB or smaller', 'FILE_TOO_LARGE', { limit: 5 }))
      return
    }
    next(ApiError.badRequest('Invalid upload', 'UPLOAD_ERROR'))
  })
}

// Any authenticated user may upload an image — the sensitive step
// (attaching a URL as a course cover, news image, or someone else's
// avatar) is authorized separately by whichever course:update/news:manage/
// user:update endpoint actually persists it. This endpoint alone can only
// ever add an object to storage.
uploadsRouter.post('/image', authenticate, imageUploadRateLimiter, uploadSingleImage, uploadController.image)
