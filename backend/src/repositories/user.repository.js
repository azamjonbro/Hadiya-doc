import { User } from '../models/user.model.js'
import { Role } from '../models/role.model.js'

export const userRepository = {
  findByEmailOrUsername(identifier) {
    const normalized = identifier.trim().toLowerCase()
    return User.findOne({ $or: [{ email: normalized }, { username: normalized }] })
  },

  findById(id) {
    return User.findById(id)
  },

  findByIds(ids) {
    return User.find({ _id: { $in: ids } })
  },

  countAll() {
    return User.countDocuments()
  },

  // Distinct department names actually in use — the admin filter offers
  // these as options instead of a free-text box, because the department
  // filter is an exact match and a typo silently returned an empty list.
  async listDepartments() {
    const values = await User.distinct('department', { department: { $nin: ['', null] } })
    return values.sort((a, b) => a.localeCompare(b))
  },

  // Distinct job titles actually in use — the task assignment picker offers
  // these so "assign to a position" is an exact match against real values
  // rather than a free-text guess. Scoped by department when a manager may
  // only see their own part of the org.
  async listPositions({ department } = {}) {
    const filter = { position: { $nin: ['', null] } }
    if (department) filter.department = department
    const values = await User.distinct('position', filter)
    return values.sort((a, b) => a.localeCompare(b))
  },

  // Leaderboard candidates and bulk task recipients: active accounts only,
  // capped so a large tenant can't turn one ranking request into an
  // unbounded scan.
  listActive({ department, position, limit = 500 } = {}) {
    const filter = { isActive: true }
    if (department) filter.department = department
    if (position) filter.position = position
    return User.find(filter).sort({ fullName: 1 }).limit(limit)
  },

  // Chat contact picker: every colleague you could start a thread with.
  // Sorted newest-first so freshly created accounts surface at the top of
  // the directory (they are the ones nobody has messaged yet), and capped
  // so a large tenant cannot turn the picker into an unbounded scan.
  searchDirectory({ search = '', excludeId, limit = 100 } = {}) {
    const filter = { isActive: true }
    if (excludeId) filter._id = { $ne: excludeId }
    if (search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ fullName: regex }, { username: regex }, { email: regex }, { department: regex }, { position: regex }]
    }
    return User.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
  },

  create(data) {
    return User.create(data)
  },

  // Course auto-assign targets: active users matching every given role name
  // (roleNames empty = no role constraint) and/or department (empty = no
  // department constraint). Role names are resolved to Role ids since
  // User.roleId is a reference, not a string.
  async listActiveByRolesAndDepartment({ roleNames = [], department = '' } = {}) {
    const filter = { isActive: true }
    if (department) filter.department = department
    if (roleNames.length) {
      const roles = await Role.find({ name: { $in: roleNames.map((name) => name.toUpperCase()) } }, { _id: 1 })
      filter.roleId = { $in: roles.map((role) => role._id) }
    }
    return User.find(filter)
  },

  // Shared by listPage and count so a page and its total can never be
  // computed from two subtly different filters.
  buildFilter({ search, roleId, department, isActive }) {
    const filter = {}
    if (search) {
      const regex = new RegExp(search.trim(), 'i')
      filter.$or = [{ fullName: regex }, { username: regex }, { email: regex }]
    }
    if (roleId) filter.roleId = roleId
    if (department) filter.department = department
    if (isActive !== undefined) filter.isActive = isActive
    return filter
  },

  // Two modes on purpose:
  //  - `page` (1-based) skips into the result set, which is what a numbered
  //    pager needs — it has to jump to page 7 without walking pages 1..6.
  //  - `cursor` keeps the original keyset behaviour for "load more" callers.
  // Both sort by _id so a document never shifts between pages mid-read.
  listPage(params) {
    const { cursor, page, limit } = params
    const filter = this.buildFilter(params)
    if (cursor) filter._id = { $gt: cursor }

    const query = User.find(filter).sort({ _id: 1 })
    if (page) return query.skip((page - 1) * limit).limit(limit)
    // One extra row is the "is there a next page?" probe for cursor mode.
    return query.limit(limit + 1)
  },

  count(params) {
    return User.countDocuments(this.buildFilter(params))
  },

  updateById(id, data) {
    return User.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  setActive(id, isActive) {
    return User.findByIdAndUpdate(id, { $set: { isActive } }, { new: true })
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
