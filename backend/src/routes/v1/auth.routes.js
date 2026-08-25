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
