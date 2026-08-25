import { Schema, model } from 'mongoose'

/**
 * One row per user, holding what daily face verification needs: whether the
 * feature applies to this user, their enrolled face embedding, and simple
 * failed-attempt/lockout counters mirroring the ones already on User for
 * password login (see user.repository.js's registerFailedLogin).
 *
 * The embedding is a face descriptor (a fixed-length float vector produced
 * by the enrollment model), never a raw image, and lives in its own
 * collection rather than on User so it cannot leak through GET /users/:id
 * or any other user-serialization path by construction. `select: false` is
 * a second layer on top of that — a plain FaceProfile.findOne() never
 * returns it either, only the one repository method that opts in.
 */
const faceProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: true },
    enrolled: { type: Boolean, default: false },
    embedding: { type: [Number], default: undefined, select: false },
    modelVersion: { type: String, default: null },
    // Object key in the private faces bucket — kept only so SUPERADMIN can
    // review what was enrolled before re-enrolling someone. Never a URL,
    // never returned to any client except through the audited
    // GET /auth/face/:userId/reference-image stream.
    referenceImageKey: { type: String, default: null },
    referenceImageContentType: { type: String, default: null },
    enrolledAt: { type: Date, default: null },
    enrolledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastVerifiedAt: { type: Date, default: null },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
)

export const FaceProfile = model('FaceProfile', faceProfileSchema)
