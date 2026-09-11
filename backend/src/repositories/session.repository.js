import { Session } from '../models/session.model.js'

export const sessionRepository = {
  create(data) {
    return Session.create(data)
  },

  /**
   * Whether this account has ever signed in from this user-agent before.
   *
   * A user-agent string is a coarse device fingerprint — two identical
   * laptops look the same, and a browser upgrade looks like a new device.
   * That is the right way round for a security alert: a false "new device"
   * is a moment of attention, a missed one is a compromise nobody heard
   * about. Revoked and expired sessions count, because the question is what
   * this person has used, not what is live now.
   */
  hasSeenUserAgent(userId, userAgent) {
    if (!userAgent) return Promise.resolve(true)
    return Session.exists({ userId, userAgent })
  },

  findActiveByTokenHash(refreshTokenHash) {
    return Session.findOne({ refreshTokenHash })
  },

  /**
   * The live end of a rotation chain: S1 → S2 → S3, given S1. Null when the
   * chain ends in a session that was revoked for real (logout, "sign out
   * everywhere") rather than replaced.
   */
  async findLiveReplacement(session) {
    let current = session
    for (let hops = 0; hops < 20 && current?.replacedBy; hops += 1) {
      current = await Session.findById(current.replacedBy)
    }
    return current && !current.revoked ? current : null
  },

  async revoke(sessionId) {
    await Session.updateOne({ _id: sessionId }, { $set: { revoked: true } })
  },

  async revokeAllForUser(userId) {
    await Session.updateMany({ userId, revoked: false }, { $set: { revoked: true } })
  },

  async markReplaced(sessionId, newSessionId) {
    await Session.updateOne(
      { _id: sessionId },
      { $set: { revoked: true, replacedBy: newSessionId } }
    )
  },
}
