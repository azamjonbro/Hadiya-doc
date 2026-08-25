import { authService } from '../services/auth/auth.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { setAuthCookies, clearAuthCookies, getRefreshToken } from '../utils/cookies.js'
import { requestMeta } from '../utils/requestMeta.js'

export const authController = {
  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, requestMeta(req))

    // Credentials were valid but a daily face check still stands between
    // this request and a session — no access/refresh/CSRF tokens exist yet,
    // only the short-lived challenge the client exchanges via
    // POST /auth/face/verify.
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

  refresh: asyncHandler(async (req, res) => {
    const currentRefreshToken = getRefreshToken(req)
    const { accessToken, refreshToken, user } = await authService.refresh(
      currentRefreshToken,
      requestMeta(req)
    )
    const csrfToken = setAuthCookies(res, { refreshToken })
    sendSuccess(res, { accessToken, user, csrfToken }, 'Token refreshed')
  }),

  logout: asyncHandler(async (req, res) => {
    await authService.logout(getRefreshToken(req))
    clearAuthCookies(res)
    sendSuccess(res, null, 'Logged out')
  }),

  requestPasswordReset: asyncHandler(async (req, res) => {
    await authService.requestPasswordReset(req.body.identifier)
    sendSuccess(res, null, 'If the account exists, a reset link has been issued')
  }),

  confirmPasswordReset: asyncHandler(async (req, res) => {
    await authService.confirmPasswordReset(req.body.token, req.body.newPassword)
    sendSuccess(res, null, 'Password has been reset')
  }),
}
