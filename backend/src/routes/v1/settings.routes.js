import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { settingsService } from '../../services/settings/settings.service.js'
import { updateSettingsSchema } from '../../validators/settings.validator.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { sendSuccess } from '../../utils/apiResponse.js'

export const settingsRouter = Router()

/**
 * Branding is public, and has to be.
 *
 * The login page needs the company name and logo, and nobody is signed in
 * yet. It is deliberately the only section served without a token — the
 * others describe how the platform behaves and belong to whoever
 * administers it.
 */
settingsRouter.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const settings = await settingsService.get()
    sendSuccess(res, {
      branding: settings.branding,
      locale: { defaultLang: settings.locale.defaultLang },
    })
  })
)

settingsRouter.use(authenticate)

// Reading the rest is open to any signed-in user: the client needs to know
// whether the leaderboard is on and which language to default to. Writing
// is the platform-settings permission.
settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await settingsService.get())
  })
)

settingsRouter.patch(
  '/',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validateBody(updateSettingsSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await settingsService.update(req.user, req.body), 'Settings saved')
  })
)
