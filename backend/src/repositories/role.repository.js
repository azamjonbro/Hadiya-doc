import { mergeRoles } from '@lms/shared'
import { Role } from '../models/role.model.js'

export const roleRepository = {
  findById(id) {
    return Role.findById(id)
  },

  findByIds(ids) {
    return Role.find({ _id: { $in: ids } })
  },

  findByName(name) {
    return Role.findOne({ name: name.toUpperCase() })
  },

  findAll() {
    return Role.find().sort({ name: 1 })
  },

  /** Every id a user document points at — the stacked list, or the one. */
  idsOf(user) {
    const ids = (user.roleIds ?? []).map(String)
    const primary = user.roleId ? String(user.roleId) : null
    if (primary && !ids.includes(primary)) ids.unshift(primary)
    return ids
  },

  /**
   * The one role-shaped object the rest of the code reads for a user:
   * permissions unioned, scope widened, name from the primary hat.
   */
  async effectiveFor(user) {
    const roles = await Role.find({ _id: { $in: this.idsOf(user) } })
    return mergeRoles(roles)
  },

  /** Same, from a preloaded id → role map (one query for a page of users). */
  effectiveFrom(user, roleById) {
    return mergeRoles(this.idsOf(user).map((id) => roleById.get(id)).filter(Boolean))
  },
}
