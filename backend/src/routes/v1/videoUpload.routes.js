import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { uploadRateLimiter } from '../../middlewares/uploadRateLimit.middleware.js'
import { tusServer } from '../../video/tusServer.js'

export const videoUploadRouter = Router()

// tus manages its own CORS/OPTIONS handling (configured with the same
// allowedOrigins as the rest of the API) — this router is mounted before
// the app's generic `cors()` middleware specifically so tus's required
// response headers (Location, Upload-Offset, Tus-Resumable, ...) go out
// as tus intends, not the default CORS header allowlist. OPTIONS requests
// (CORS preflight) skip auth since preflight never carries credentials.
videoUploadRouter.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    next()
    return
  }
  authenticate(req, res, (err) => {
    if (err) {
      next(err)
      return
    }
    requirePermission(PERMISSIONS.VIDEO_UPLOAD)(req, res, next)
  })
})

videoUploadRouter.use(uploadRateLimiter)

videoUploadRouter.all('*', (req, res) => {
  tusServer.handle(req, res)
})
