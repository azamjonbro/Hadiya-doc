import { Router } from 'express'
import { authController } from '../../controllers/auth.controller.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { verifyCsrf } from '../../middlewares/csrf.middleware.js'
import {
  authRateLimiter,
  loginRateLimiter,
  loginSlowDown,
  passwordResetRateLimiter,
} from '../../middlewares/loginRateLimit.middleware.js'
import {
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} from '../../validators/auth.validator.js'
import { faceRouter } from './face.routes.js'
import { ssoController } from '../../controllers/sso.controller.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { ssoCallbackSchema, ssoExchangeSchema, ssoStartSchema } from '../../validators/sso.validator.js'

export const authRouter = Router()

// Replaces the app-wide baseRateLimiter, which skips this prefix so login
// and refresh stay reachable once the general budget is spent. Nested here
// (rather than mounted separately on v1Router) so /auth/face/* inherits it
// too, exactly as SELF_LIMITED_PREFIXES in rateLimit.middleware.js expects.
authRouter.use(authRateLimiter)

// Mounted first: /face/verify must reach faceRouter even for a request that
// carries no Authorization header (the mid-login challenge case), and nothing
// above this line requires one.
authRouter.use('/face', faceRouter)

authRouter.post('/login', loginRateLimiter, loginSlowDown, validateBody(loginSchema), authController.login)
authRouter.post('/refresh', verifyCsrf, authController.refresh)
authRouter.post('/logout', authController.logout)
authRouter.post(
  '/password-reset/request',
  passwordResetRateLimiter,
  validateBody(passwordResetRequestSchema),
  authController.requestPasswordReset
)
authRouter.post(
  '/password-reset/confirm',
  passwordResetRateLimiter,
  validateBody(passwordResetConfirmSchema),
  authController.confirmPasswordReset
)

/**
 * Single sign-on (11.4).
 *
 * Unauthenticated by nature — this is how somebody signs in — and under
 * the same `authRateLimiter` as the rest of `/auth`. `/callback` is a GET
 * because the identity provider redirects a browser to it, and `/exchange`
 * is the SPA turning the handoff code into a session.
 */
authRouter.get('/sso/status', ssoController.status)
authRouter.get('/sso/start', validateQuery(ssoStartSchema), ssoController.start)
authRouter.get('/sso/callback', validateQuery(ssoCallbackSchema), ssoController.callback)
authRouter.post(
  '/sso/exchange',
  // The same limiter a password login gets: the handoff code is
  // single-use and short-lived, but guessing at one should still cost.
  loginRateLimiter,
  validateBody(ssoExchangeSchema),
  ssoController.exchange
)
