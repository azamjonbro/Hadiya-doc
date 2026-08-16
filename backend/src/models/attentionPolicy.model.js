import { Schema, model } from 'mongoose'

// One row per scope: a single GLOBAL row plus at most one row per course.
// Every setting is optional on purpose — a stored `undefined` means "inherit
// from the layer above" (see resolveAttentionPolicy in @lms/shared), which is
// what lets a course override only the one knob it disagrees with instead of
// freezing a full copy of the global policy at the moment it was created.
const attentionPolicySchema = new Schema(
  {
    scope: { type: String, enum: ['GLOBAL', 'COURSE'], required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },

    enabled: { type: Boolean, default: undefined },
    graceSeconds: { type: Number, default: undefined, min: 1, max: 60 },
    pauseOnWarning: { type: Boolean, default: undefined },
    lockoutAfterWarnings: { type: Number, default: undefined, min: 0, max: 50 },
    lockoutSeconds: { type: Number, default: undefined, min: 5, max: 300 },
    requireRewatch: { type: Boolean, default: undefined },
    notifyManagerAfter: { type: Number, default: undefined, min: 0, max: 100 },
    captureOnForeignFace: { type: Boolean, default: undefined },

    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

// Partial index: the GLOBAL row has courseId null, which would collide with
// itself under a plain unique compound index on some drivers, so each scope
// gets its own guarantee.
attentionPolicySchema.index({ scope: 1, courseId: 1 }, { unique: true })

export const AttentionPolicy = model('AttentionPolicy', attentionPolicySchema)
