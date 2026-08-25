import { Schema, model } from 'mongoose'

/**
 * A short-lived, single-use ticket issued after password verification when
 * face verification is still required to finish logging in. Mirrors
 * Session's opaque-token pattern: only the SHA-256 hash is stored, the raw
 * value travels to the client exactly once (the /auth/login response) and
 * is presented once more to /auth/face/verify to prove it's the same login
 * attempt — never a bearer token, never usable against any other endpoint.
 */
const faceVerificationChallengeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// A challenge nobody used is worthless once it expires — TTL cleanup rather
// than a background job.
faceVerificationChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const FaceVerificationChallenge = model(
  'FaceVerificationChallenge',
  faceVerificationChallengeSchema
)
