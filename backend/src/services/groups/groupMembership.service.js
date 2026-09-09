import { Group } from '../../models/group.model.js'
import { User } from '../../models/user.model.js'
import { logger } from '../../config/logger.js'

/**
 * Dynamic groups: membership as a rule rather than a list.
 *
 * "Everybody in Maintenance" maintained by hand is a list that is wrong
 * within a week — somebody transfers and nobody remembers the group. As a
 * rule it is right by construction, and the cost is that `memberIds`
 * becomes a cache that has to be rebuilt when the underlying people change.
 *
 * The cache exists rather than resolving on every read because
 * `memberIds` is what the rest of the platform already reads — enrolment
 * rules, group course assignment, the chat audience. Making those all
 * resolve a rule instead would mean touching every one of them, and a
 * dynamic group would behave differently from a static one everywhere.
 */

/** Does this person match the group's rule? */
export function matchesGroupRule(user, rule) {
  if (!rule) return false
  if (rule.roles?.length && !rule.roles.includes(user.roleName)) return false
  if (rule.departments?.length && !rule.departments.includes(user.department ?? '')) return false
  if (rule.branches?.length && !rule.branches.includes(user.branch ?? '')) return false
  if (rule.positions?.length && !rule.positions.includes(user.position ?? '')) return false

  // An empty rule would sweep in the entire company. For a group that is
  // occasionally wanted and never wanted by accident, so it has to be
  // stated with at least one constraint.
  return ['roles', 'departments', 'branches', 'positions'].some((key) => rule[key]?.length)
}

export const groupMembershipService = {
  /** Who currently matches. Narrowed in the query where the field allows. */
  async resolveMembers(group) {
    const rule = group.rule ?? {}
    const filter = { isActive: true }
    if (rule.departments?.length) filter.department = { $in: rule.departments }
    if (rule.branches?.length) filter.branch = { $in: rule.branches }
    if (rule.positions?.length) filter.position = { $in: rule.positions }

    const users = await User.find(filter).populate('roleId', 'name').lean()
    return users
      .map((row) => ({ ...row, roleName: row.roleId?.name ?? '' }))
      .filter((user) => matchesGroupRule(user, rule))
      .map((user) => user._id)
  },

  /**
   * Rebuilds one group's membership.
   *
   * Returns what changed rather than the whole list: "3 joined, 1 left" is
   * what an administrator can act on, and it is also what makes the nightly
   * log readable instead of a wall of ids.
   */
  async refresh(groupId) {
    const group = await Group.findById(groupId)
    if (!group || group.type !== 'DYNAMIC') return null

    const before = new Set((group.memberIds ?? []).map(String))
    const members = await this.resolveMembers(group)
    const after = new Set(members.map(String))

    group.memberIds = members
    group.membersRefreshedAt = new Date()
    await group.save()

    return {
      groupId: String(group._id),
      total: members.length,
      joined: [...after].filter((id) => !before.has(id)).length,
      left: [...before].filter((id) => !after.has(id)).length,
    }
  },

  /** Every dynamic group — the nightly pass. */
  async refreshAll() {
    // `type: 'DYNAMIC'` rather than `$ne: 'STATIC'` on purpose: groups
    // created before this field existed have no `type` at all, and a
    // negated query would sweep every one of them into the rebuild and
    // empty their hand-curated membership.
    const groups = await Group.find({ type: 'DYNAMIC' }, { _id: 1 }).lean()
    const totals = { groups: groups.length, joined: 0, left: 0 }
    for (const group of groups) {
      const result = await this.refresh(group._id).catch((error) => {
        logger.warn('Could not refresh a dynamic group', { groupId: String(group._id), error: error.message })
        return null
      })
      if (result) {
        totals.joined += result.joined
        totals.left += result.left
      }
    }
    if (totals.joined || totals.left) logger.info('Dynamic groups refreshed', totals)
    return totals
  },

  /**
   * Rebuilds only the groups one person could have moved in or out of.
   *
   * Run when somebody's role, department, branch or position changes. A
   * full sweep on every employee edit would walk every group in the
   * company for a job title correction.
   */
  async refreshForUser(userId) {
    const user = await User.findById(userId).populate('roleId', 'name').lean()
    if (!user) return { groups: 0 }

    const groups = await Group.find({ type: 'DYNAMIC' }).lean()
    let touched = 0
    for (const group of groups) {
      const matchesNow = matchesGroupRule({ ...user, roleName: user.roleId?.name ?? '' }, group.rule)
      const isMember = (group.memberIds ?? []).some((id) => String(id) === String(userId))
      // Only the groups where the answer actually changed are rebuilt.
      if (matchesNow === isMember) continue
      await this.refresh(group._id).catch(() => null)
      touched += 1
    }
    return { groups: touched }
  },
}
