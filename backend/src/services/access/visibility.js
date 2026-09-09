import { userRepository } from '../../repositories/user.repository.js'

/**
 * "May this person see this thing?", for anything targeted at an audience.
 *
 * Courses have answered this since the beginning; learning paths (5.1) ask
 * exactly the same question of exactly the same three fields, and news,
 * events and knowledge-base articles will. Copying the rule per entity is
 * how two of them end up disagreeing about what an empty `branches` array
 * means — and the safe reading and the useful reading differ, so a copy
 * that drifts either hides content from everyone or shows it to everyone.
 *
 * The rule:
 *   - no targetRoles, no branches, no department -> visible to everybody
 *   - a constraint that is set must match; they combine with AND, so a
 *     course limited to Marketing in Toshkent reaches only people in both
 *   - an explicit assignment overrides all of it
 *
 * That last one is the admin escape hatch. Assigning a Toshkent-only course
 * to somebody in Samarqand is a deliberate act by a person who already has
 * the permission; before it existed, such an assignment produced something
 * the recipient could never open.
 */
export async function isVisibleToActor(actor, doc, { isAssigned } = {}) {
  const roleRestricted = doc.targetRoles?.length > 0
  const branchRestricted = doc.branches?.length > 0
  const deptRestricted = Boolean(doc.department)
  if (!roleRestricted && !branchRestricted && !deptRestricted) return true

  const assigned = () => (isAssigned ? isAssigned() : Promise.resolve(false))

  if (roleRestricted && !doc.targetRoles.includes(actor.roleName)) return assigned()
  if (!branchRestricted && !deptRestricted) return true

  // Only loaded once a branch or department constraint actually applies —
  // most content is unrestricted, and this is on the catalog's hot path.
  const actorUser = await userRepository.findById(actor.id)
  if (branchRestricted && !doc.branches.includes(actorUser?.branch ?? '')) return assigned()
  if (deptRestricted && actorUser?.department !== doc.department) return assigned()
  return true
}
