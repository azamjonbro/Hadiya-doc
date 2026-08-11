import { User } from '../models/user.model.js'

export const userRepository = {
  findByEmailOrUsername(identifier) {
    const normalized = identifier.trim().toLowerCase()
    return User.findOne({ $or: [{ email: normalized }, { username: normalized }] })
  },

  findById(id) {
    return User.findById(id)
  },

  countAll() {
    return User.countDocuments()
  },

  create(data) {
    return User.create(data)
  },

  async registerFailedLogin(userId, { maxAttempts, lockMinutes }) {
    const user = await User.findById(userId)
    if (!user) return null

    user.failedLoginAttempts += 1
    if (user.failedLoginAttempts >= maxAttempts) {
      user.lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000)
      user.failedLoginAttempts = 0
    }
    await user.save()
    return user
  },

  async resetFailedLogins(userId) {
    await User.updateOne({ _id: userId }, { $set: { failedLoginAttempts: 0, lockedUntil: null } })
  },

  async setPasswordResetToken(userId, tokenHash, expiresAt) {
    await User.updateOne(
      { _id: userId },
      { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt } }
    )
  },

  findByValidResetTokenHash(tokenHash) {
    return User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    })
  },

  async setPassword(userId, passwordHash) {
    await User.updateOne(
      { _id: userId },
      {
        $set: { passwordHash },
        $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' },
      }
    )
  },
}
