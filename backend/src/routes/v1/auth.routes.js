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

export const authRouter = Router()

// Replaces the app-wide baseRateLimiter, which skips this prefix so login
// and refresh stay reachable once the general budget is spent.
authRouter.use(authRateLimiter)

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
