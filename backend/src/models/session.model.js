import { Schema, model } from 'mongoose'

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'Session', default: null },
  },
  { timestamps: true }
)

sessionSchema.index({ userId: 1, revoked: 1 })

export const Session = model('Session', sessionSchema)
