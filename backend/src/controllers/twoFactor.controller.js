import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { twoFactorService } from '../services/auth/twoFactor.service.js'
import { sessionService } from '../services/auth/session.service.js'
import { setAuthCookies, getRefreshToken } from '../utils/cookies.js'
import { requestMeta } from '../utils/requestMeta.js'

export const twoFactorController = {
  status: asyncHandler(async (req, res) => {
    sendSuccess(res, await twoFactorService.status(req.user))
  }),

  /** The secret, its URI and a QR — shown once, on one screen. */
  setup: asyncHandler(async (req, res) => {
    sendSuccess(res, await twoFactorService.beginSetup(req.user), 'Scan the code, then confirm it')
  }),

  /** 200 with the recovery codes: the only time they exist outside paper. */
  enable: asyncHandler(async (req, res) => {
    sendSuccess(res, await twoFactorService.enable(req.user, req.body.code), 'Two-factor authentication is on')
  }),

  disable: asyncHandler(async (req, res) => {
    sendSuccess(res, await twoFactorService.disable(req.user, req.body.code), 'Two-factor authentication is off')
  }),

  regenerate: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await twoFactorService.regenerateRecoveryCodes(req.user, req.body.code),
      'New recovery codes — the old ones no longer work'
    )
  }),

  /**
   * The second step of a login. Answers exactly like `POST /auth/login`,
   * so the client has one code path for "we are now signed in".
   */
  verify: asyncHandler(async (req, res) => {
    const result = await twoFactorService.completeLogin(req.body.token, req.body.code, requestMeta(req))

    // The face policy can still stand between here and a session.
    if (result.requiresFaceVerification) {
      sendSuccess(
        res,
        { requiresFaceVerification: true, verificationToken: result.verificationToken },
        'Face verification required'
      )
      return
    }

    const { accessToken, refreshToken, user } = result
    const csrfToken = setAuthCookies(res, { refreshToken })
    sendSuccess(res, { accessToken, user, csrfToken }, 'Logged in')
  }),
}

export const sessionController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await sessionService.list(req.user, getRefreshToken(req)))
  }),

  revoke: asyncHandler(async (req, res) => {
    sendSuccess(res, await sessionService.revoke(req.user, req.params.id, getRefreshToken(req)), 'Session ended')
  }),

  revokeOthers: asyncHandler(async (req, res) => {
    sendSuccess(res, await sessionService.revokeOthers(req.user, getRefreshToken(req)), 'Other sessions ended')
  }),
}
