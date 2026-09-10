import { Router } from 'express'
import multer from 'multer'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { scormFrameHeaders } from '../../middlewares/scormFrame.middleware.js'
import { scormController } from '../../controllers/scorm.controller.js'
import { updateScormSchema, scormCommitSchema, scormTokenQuerySchema } from '../../validators/scorm.validator.js'
import { env } from '../../config/env.js'

export const scormRouter = Router()

/**
 * Two halves, and the order matters.
 *
 * The first half is authorised by the launch token in the URL, not by a
 * bearer token: these are the requests a package makes for itself — the
 * player page the SPA frames, every file the content loads, and the state
 * calls the runtime makes. A browser attaches no Authorization header to an
 * iframe or to an image inside one (see scormToken.js for why the token
 * sits in the path rather than the query).
 *
 * So they are mounted before `authenticate`, which the second half uses.
 */
scormRouter.get('/:id/player/:token', scormFrameHeaders, scormController.player)
// Everything after the token is the package's own path. Express 4 needs the
// wildcard spelled this way; `req.params[0]` is the captured remainder.
scormRouter.get('/:id/f/:token/*', scormFrameHeaders, scormController.file)
scormRouter.get('/:id/state', validateQuery(scormTokenQuerySchema), scormController.readState)
scormRouter.post(
  '/:id/state',
  validateQuery(scormTokenQuerySchema),
  validateBody(scormCommitSchema),
  scormController.writeState
)

scormRouter.use(authenticate)

scormRouter.get('/:id', requirePermission(PERMISSIONS.VIDEO_VIEW), scormController.getById)
scormRouter.get('/:id/launch', requirePermission(PERMISSIONS.VIDEO_VIEW), scormController.launch)
scormRouter.get('/:id/progress', requirePermission(PERMISSIONS.VIDEO_VIEW), scormController.progress)

// course:update, like a lesson: a package is part of the course's content,
// and uploading one is authoring rather than managing a single video.
scormRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateScormSchema),
  scormController.update
)
scormRouter.post('/:id/reprocess', requirePermission(PERMISSIONS.COURSE_UPDATE), scormController.reprocess)
scormRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_UPDATE), scormController.remove)

/**
 * The upload, mounted on the topic (see topics.routes.js).
 *
 * Memory storage with the package cap: the buffer goes straight to S3 and
 * the worker unpacks it from there, so it never touches this box's disk —
 * the same reasoning as the material upload, one size class up.
 */
export const scormUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.SCORM_MAX_FILE_SIZE_MB * 1024 * 1024 },
})
