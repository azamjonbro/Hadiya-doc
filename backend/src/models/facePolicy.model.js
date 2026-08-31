import { Schema, model } from 'mongoose'

/**
 * A single GLOBAL row holding the organisation-wide face-verification
 * settings. One scope only, unlike attentionPolicy.model.js: whether an
 * employee is who they say they are is not a per-course question, and a
 * course that could opt itself out of identity checks would make the setting
 * advisory.
 *
 * Every field is optional on purpose — a stored `undefined` means "inherit
 * the shared default" (resolveFacePolicy in @lms/shared), so an install that
 * has never opened the settings page simply runs on the defaults rather than
 * on a copy of them frozen at first boot.
 */
const facePolicySchema = new Schema(
  {
    scope: { type: String, enum: ['GLOBAL'], required: true, default: 'GLOBAL', unique: true },

    verifyEveryOpen: { type: Boolean, default: undefined },

    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export const FacePolicy = model('FacePolicy', facePolicySchema)
