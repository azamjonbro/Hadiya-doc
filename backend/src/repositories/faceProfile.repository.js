import { FaceProfile } from '../models/faceProfile.model.js'

export const faceProfileRepository = {
  findByUserId(userId) {
    return FaceProfile.findOne({ userId })
  },

  // The one call site allowed to see the embedding — actually comparing a
  // submitted face against it.
  findByUserIdWithEmbedding(userId) {
    return FaceProfile.findOne({ userId }).select('+embedding')
  },

  async upsertEnrollment(
    userId,
    { embedding, modelVersion, referenceImageKey, referenceImageContentType, enrolledBy }
  ) {
    return FaceProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          enabled: true,
          enrolled: true,
          embedding,
          modelVersion,
          referenceImageKey,
          referenceImageContentType,
          enrolledAt: new Date(),
          enrolledBy,
          failedAttempts: 0,
          lockedUntil: null,
        },
      },
      { new: true, upsert: true }
    )
  },

  setEnabled(userId, enabled) {
    return FaceProfile.findOneAndUpdate({ userId }, { $set: { enabled } }, { new: true })
  },

  markVerified(userId) {
    return FaceProfile.findOneAndUpdate(
      { userId },
      { $set: { lastVerifiedAt: new Date(), failedAttempts: 0, lockedUntil: null } },
      { new: true }
    )
  },

  async registerFailedAttempt(userId, { maxAttempts, lockMinutes }) {
    const profile = await FaceProfile.findOne({ userId })
    if (!profile) return null

    profile.failedAttempts += 1
    if (profile.failedAttempts >= maxAttempts) {
      profile.lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000)
      profile.failedAttempts = 0
    }
    await profile.save()
    return profile
  },
}
