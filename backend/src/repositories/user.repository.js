import { isJshshir, isPassportSeries, normalizeJshshir, normalizePassportSeries } from '@lms/shared'
import { User } from '../models/user.model.js'
import { Role } from '../models/role.model.js'

export const userRepository = {
  // One login box, three accepted handles: JSHSHIR, passport series, or email.
  // The candidate fields are narrowed by shape first, so `12345678901234` is
  // only ever looked up as a JSHSHIR — matching every field against every
  // input would let one employee's passport series shadow another's email.
  // Email stays a valid handle so accounts created before JSHSHIR existed —
  // the seeded SUPERADMIN above all — can still sign in.
  findByIdentifier(identifier) {
    const raw = String(identifier ?? '').trim()
    const or = []

    if (isJshshir(raw)) or.push({ jshshir: normalizeJshshir(raw) })
    if (isPassportSeries(raw)) or.push({ passportSeries: normalizePassportSeries(raw) })
    if (raw.includes('@')) or.push({ email: raw.toLowerCase() })

    // Nothing that could match any column — skip the query rather than send
    // `{ $or: [] }`, which Mongo rejects.
    if (!or.length) return Promise.resolve(null)
    return User.findOne({ $or: or })
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

  // Headcount per branch for the admin branches page. Inactive accounts are
  // counted separately rather than dropped: a branch whose people have all
  // been deactivated should still be visible, not silently disappear.
  async branchStats() {
    return User.aggregate([
      { $match: { branch: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$branch',
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ])
  },

  // Same idea for branches as departments above: the course targeting picker
  // and the admin filters offer real values rather than a free-text box, so
  // "Toshkent" and "toshkent" can't quietly become two different branches
  // that each hide courses from the other.
  async listBranches() {
    const values = await User.distinct('branch', { branch: { $nin: ['', null] } })
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
      filter.$or = [
        { fullName: regex },
        { jshshir: regex },
        { passportSeries: regex },
        { email: regex },
        { department: regex },
        { position: regex },
      ]
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
  async listActiveByRolesAndDepartment({ roleNames = [], branches = [], department = '' } = {}) {
    const filter = { isActive: true }
    if (department) filter.department = department
    if (branches.length) filter.branch = { $in: branches }
    if (roleNames.length) {
      const roles = await Role.find({ name: { $in: roleNames.map((name) => name.toUpperCase()) } }, { _id: 1 })
      filter.roleId = { $in: roles.map((role) => role._id) }
    }
    return User.find(filter)
  },

  // Shared by listPage and count so a page and its total can never be
  // computed from two subtly different filters.
  buildFilter({ search, roleId, branch, department, subdivision, country, position, employment }) {
    const filter = {}
    if (search) {
      const regex = new RegExp(search.trim(), 'i')
      filter.$or = [{ fullName: regex }, { jshshir: regex }, { passportSeries: regex }, { email: regex }]
    }
    if (roleId) filter.roleId = roleId
    if (branch) filter.branch = branch
    if (department) filter.department = department
    if (subdivision) filter.subdivision = subdivision
    if (country) filter.country = country
    if (position) filter.position = position

    // Three states, not two. Someone who left the company is archived, which
    // is a different thing from an account an admin switched off while the
    // person is still employed — the old active/inactive pair could not tell
    // those apart, and "who works here" is the question this page is for.
    if (employment === 'working') filter.terminationDate = null
    if (employment === 'archived') filter.terminationDate = { $ne: null }
    if (employment === 'active') Object.assign(filter, { isActive: true, terminationDate: null })
    if (employment === 'inactive') Object.assign(filter, { isActive: false, terminationDate: null })
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

  // `unset` clears optional identity fields off the document rather than
  // blanking them — see the partial unique indexes in user.model.js.
  updateById(id, data, unset = {}) {
    const update = {}
    if (Object.keys(data).length) update.$set = data
    if (Object.keys(unset).length) update.$unset = unset
    return User.findByIdAndUpdate(id, update, { new: true, runValidators: true })
  },

  setActive(id, isActive) {
    return User.findByIdAndUpdate(id, { $set: { isActive } }, { new: true })
  },

  // The whole selection in one write, so a bulk deactivation cannot leave
  // half the employees switched off. Callers have already decided which ids
  // they are allowed to touch — this does no checking of its own.
  setManyActive(ids, isActive) {
    return User.updateMany({ _id: { $in: ids } }, { $set: { isActive } })
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
