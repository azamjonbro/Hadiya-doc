import { Schema, model } from 'mongoose'

/**
 * A branch's own look (rasm: each sub-portal has its own settings). Every
 * field is an override of the company-wide `settings.branding`: empty
 * means "inherit". Keyed by the branch name the way employees are tagged
 * with it, so a renamed branch is re-keyed by the branch service.
 */
const branchBrandingSchema = new Schema(
  {
    branch: { type: String, required: true, trim: true },
    branchKey: { type: String, required: true, unique: true, lowercase: true, trim: true },
    appName: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '' },
    loginBackgroundUrl: { type: String, default: '' },
    coursesCoverUrl: { type: String, default: '' },
    catalogCoverUrl: { type: String, default: '' },
    profileCoverUrl: { type: String, default: '' },
    portalNav: { type: [{ name: String, enabled: { type: Boolean, default: true } }], default: [] },
    startPage: { type: String, default: '' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export const BranchBranding = model('BranchBranding', branchBrandingSchema)

export const BRANDING_FIELDS = [
  'appName',
  'logoUrl',
  'faviconUrl',
  'primaryColor',
  'loginBackgroundUrl',
  'coursesCoverUrl',
  'catalogCoverUrl',
  'profileCoverUrl',
  'portalNav',
  'startPage',
]

/** The company branding with a branch's non-empty overrides laid on top. */
export function mergeBranding(base, override) {
  const merged = { ...(base ?? {}) }
  if (!override) return merged
  for (const field of BRANDING_FIELDS) {
    const value = override[field]
    if (Array.isArray(value) ? value.length : value) merged[field] = value
  }
  return merged
}
