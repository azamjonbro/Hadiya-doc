import { faceVerificationService } from '../services/face/faceVerification.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { setAuthCookies } from '../utils/cookies.js'
import { requestMeta } from '../utils/requestMeta.js'

export const faceController = {
  enroll: asyncHandler(async (req, res) => {
    const result = await faceVerificationService.enroll(req.user, req.body.userId, req.files)
    sendSuccess(res, result, 'Face enrolled', 201)
  }),

  reEnroll: asyncHandler(async (req, res) => {
    const result = await faceVerificationService.reEnroll(req.user, req.body.userId, req.files)
    sendSuccess(res, result, 'Face re-enrolled')
  }),

  verify: asyncHandler(async (req, res) => {
    const result = await faceVerificationService.verify(
      {
        userId: req.user.id,
        viaChallenge: Boolean(req.faceChallenge),
        challenge: req.faceChallenge,
        meta: requestMeta(req),
      },
      req.file
    )

    if (result.viaChallenge) {
      const csrfToken = setAuthCookies(res, { refreshToken: result.refreshToken })
      sendSuccess(res, { accessToken: result.accessToken, user: result.user, csrfToken }, 'Logged in')
      return
    }

    sendSuccess(res, { verified: true, lastVerifiedAt: result.lastVerifiedAt }, 'Face verified')
  }),

  status: asyncHandler(async (req, res) => {
    sendSuccess(res, await faceVerificationService.status(req.user.id))
  }),

  statusForUser: asyncHandler(async (req, res) => {
    sendSuccess(res, await faceVerificationService.status(req.params.userId))
  }),

  setEnabled: asyncHandler(async (req, res) => {
    sendSuccess(res, await faceVerificationService.setEnabled(req.user, req.params.userId, req.body.enabled))
  }),

  // Streams the bytes rather than handing out a URL — the faces bucket has
  // no public policy and no signed links, so this handler is the only way
  // in, same treatment as proctor.controller.js's image handler.
  referenceImage: asyncHandler(async (req, res) => {
    const { body, contentType } = await faceVerificationService.referenceImage(req.user, req.params.userId)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, no-store')
    body.pipe(res)
  }),
}
