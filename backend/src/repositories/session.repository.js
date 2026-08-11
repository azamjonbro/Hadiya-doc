import { Session } from '../models/session.model.js'

export const sessionRepository = {
  create(data) {
    return Session.create(data)
  },

  findActiveByTokenHash(refreshTokenHash) {
    return Session.findOne({ refreshTokenHash })
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
