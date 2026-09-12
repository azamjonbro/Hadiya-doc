import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { settingsService } from '../../services/settings/settings.service.js'
import { BranchBranding, BRANDING_FIELDS, mergeBranding } from '../../models/branchBranding.model.js'
import { updateSettingsSchema, branchBrandingSchema } from '../../validators/settings.validator.js'
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
  asyncHandler(async (req, res) => {
    const settings = await settingsService.get()
    // `?branch=` lays that branch's overrides over the company branding —
    // the portal asks for the signed-in person's branch after login.
    const branch = String(req.query.branch ?? '').trim().toLowerCase()
    const override = branch ? await BranchBranding.findOne({ branchKey: branch }).lean() : null
    sendSuccess(res, {
      branding: mergeBranding(settings.branding, override),
      branch: override ? override.branch : '',
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

// A branch's own portal look: read raw (empty = inherits), written whole.
settingsRouter.get(
  '/branding/:branch',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  asyncHandler(async (req, res) => {
    const row = await BranchBranding.findOne({ branchKey: req.params.branch.toLowerCase() }).lean()
    sendSuccess(res, { branding: row ? Object.fromEntries(BRANDING_FIELDS.map((f) => [f, row[f]])) : null })
  })
)
settingsRouter.put(
  '/branding/:branch',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validateBody(branchBrandingSchema),
  asyncHandler(async (req, res) => {
    const branch = req.params.branch.trim()
    const row = await BranchBranding.findOneAndUpdate(
      { branchKey: branch.toLowerCase() },
      { $set: { ...req.body, branch, updatedBy: req.user.id }, $setOnInsert: { branchKey: branch.toLowerCase() } },
      { upsert: true, new: true, runValidators: true }
    ).lean()
    sendSuccess(res, { branding: Object.fromEntries(BRANDING_FIELDS.map((f) => [f, row[f]])) }, 'Branch branding saved')
  })
)
settingsRouter.delete(
  '/branding/:branch',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  asyncHandler(async (req, res) => {
    await BranchBranding.deleteOne({ branchKey: req.params.branch.toLowerCase() })
    sendSuccess(res, { deleted: true }, 'Branch branding removed')
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
