import { proctorSnapshotService } from '../services/proctoring/proctorSnapshot.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const proctorController = {
  capture: asyncHandler(async (req, res) => {
    const result = await proctorSnapshotService.capture(req.user, req.params.videoId, {
      file: req.file,
      reason: req.body.reason,
      sessionId: req.body.sessionId,
      position: req.body.position !== undefined ? Number(req.body.position) : null,
      faceCount: req.body.faceCount !== undefined ? Number(req.body.faceCount) : null,
    })
    sendSuccess(res, result, 'Snapshot recorded', 201)
  }),

  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await proctorSnapshotService.list(req.user, req.query))
  }),

  // Streams the bytes rather than handing out a URL: the proctor bucket has no
  // public policy and no signed links, so this handler is the only way in.
  image: asyncHandler(async (req, res) => {
    const { body, contentType } = await proctorSnapshotService.image(req.user, req.params.id)
    res.setHeader('Content-Type', contentType)
    // A photograph of an employee has no business in a shared cache.
    res.setHeader('Cache-Control', 'private, no-store')
    body.pipe(res)
  }),

  markReviewed: asyncHandler(async (req, res) => {
    sendSuccess(res, await proctorSnapshotService.markReviewed(req.user, req.params.id), 'Marked as reviewed')
  }),
}
