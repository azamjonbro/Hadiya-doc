import { ROLES } from '@lms/shared'
import { User } from '../../models/user.model.js'
import { userRepository } from '../../repositories/user.repository.js'

/**
 * Which employees an actor is allowed to see data about.
 *
 * `null` means "no constraint" — an admin-tier caller. An array (possibly
 * empty) is an allow-list every query must intersect with.
 *
 * This exists because the fence around a manager was enforced in the places
 * a manager browses (users, tasks, groups, assignments, the leaderboard) but
 * not in the place a manager exports: `GET /reports/:type/export` never saw
 * the actor at all, so the same person who could not open a colleague from
 * another department could download the whole company as a spreadsheet.
 *
 * The rule is still department-based and still keyed off the seeded MANAGER
 * role, exactly as the other call sites are — this only makes it reusable so
 * there is one definition to change when scope moves onto the role document
 * itself and stops depending on a hard-coded role name.
 */
export async function scopedUserIdsFor(actor) {
  if (!actor) return []
  if (actor.roleName !== ROLES.MANAGER) return null

  const actorUser = await userRepository.findById(actor.id)
  const department = actorUser?.department ?? ''
  // A manager with no department is fenced to nobody rather than to
  // everybody: the same fail-closed choice task.service.js makes when it
  // refuses a department-less broadcast.
  if (!department) return []

  const ids = await User.distinct('_id', { department })
  return ids.map((id) => id.toString())
}

/** True when the actor may read data about anyone. */
export function hasUnscopedAccess(actor) {
  return actor?.roleName !== ROLES.MANAGER
}
