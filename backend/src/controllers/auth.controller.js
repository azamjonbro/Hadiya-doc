import { authService } from '../services/auth/auth.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { setAuthCookies, clearAuthCookies, getRefreshToken } from '../utils/cookies.js'

function requestMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] ?? '' }
}

export const authController = {
  login: asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, user } = await authService.login(req.body, requestMeta(req))
    setAuthCookies(res, { refreshToken })
    sendSuccess(res, { accessToken, user }, 'Logged in')
  }),

  refresh: asyncHandler(async (req, res) => {
    const currentRefreshToken = getRefreshToken(req)
    const { accessToken, refreshToken, user } = await authService.refresh(
      currentRefreshToken,
      requestMeta(req)
    )
    setAuthCookies(res, { refreshToken })
    sendSuccess(res, { accessToken, user }, 'Token refreshed')
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
