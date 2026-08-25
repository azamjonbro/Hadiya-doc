import { FaceVerificationChallenge } from '../models/faceVerificationChallenge.model.js'

export const faceVerificationChallengeRepository = {
  create(data) {
    return FaceVerificationChallenge.create(data)
  },

  findActiveByTokenHash(tokenHash) {
    return FaceVerificationChallenge.findOne({
      tokenHash,
      consumed: false,
      expiresAt: { $gt: new Date() },
    })
  },

  async consume(id) {
    await FaceVerificationChallenge.updateOne({ _id: id }, { $set: { consumed: true } })
  },
}
