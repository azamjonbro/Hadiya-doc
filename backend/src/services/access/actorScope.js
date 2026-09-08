import { ROLE_SCOPES, resolveRoleScope } from '@lms/shared'
import { User } from '../../models/user.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { orgHierarchyService } from '../org/orgHierarchy.service.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Which employees an actor is allowed to see data about.
 *
 * `null` means "no constraint" — an ALL-scoped, admin-tier caller. An array
 * (possibly empty) is an allow-list every query must intersect with.
 *
 * Before 2.2 this asked `roleName === 'MANAGER'`. That made roles-as-data a
 * half-truth: a role created through the API came out unscoped, so granting
 * it `user:read` handed over the entire company (AT-21). The answer now
 * comes from `role.scope`, and no code anywhere needs to know a role's name.
 *
 * The four scopes:
 *
 *   ALL         null — admin tier, no fence
 *   DEPARTMENT  everyone sharing the actor's department (what MANAGER did)
 *   TEAM        everyone below the actor in the org chart (2.1)
 *   SELF        only themselves
 *
 * Every scope but ALL fails closed: a DEPARTMENT actor with no department,
 * or a TEAM actor with no reports, is fenced to nobody rather than to
 * everybody. That is the same choice task.service.js already made when it
 * refused a department-less broadcast.
 */

export function actorScope(actor) {
  if (!actor) return ROLE_SCOPES.SELF
  return actor.scope ?? resolveRoleScope(actor.roleName)
}

/** True when the actor may read data about anyone. */
export function hasUnscopedAccess(actor) {
  return actorScope(actor) === ROLE_SCOPES.ALL
}

/** True when a fence applies — the inverse, spelled out because call sites read better for it. */
export function isScoped(actor) {
  return !hasUnscopedAccess(actor)
}

/**
 * The department an actor is fenced to, or '' when they have none.
 *
 * Only meaningful for DEPARTMENT scope; the call sites that ask are the ones
 * that filter by department rather than by a list of ids.
 */
export async function actorDepartmentFor(actor) {
  const user = await userRepository.findById(actor.id)
  return user?.department ?? ''
}

export async function scopedUserIdsFor(actor) {
  if (!actor) return []
  const scope = actorScope(actor)

  if (scope === ROLE_SCOPES.ALL) return null
  if (scope === ROLE_SCOPES.SELF) return [String(actor.id)]

  if (scope === ROLE_SCOPES.TEAM) {
    // The actor themselves is included: a manager looking at "my team"
    // expects to be in it, and every caller that wants strictly-below can
    // ask orgHierarchyService directly.
    const managed = await orgHierarchyService.managedUserIds(actor.id)
    return [String(actor.id), ...managed]
  }

  const department = await actorDepartmentFor(actor)
  if (!department) return []
  const ids = await User.distinct('_id', { department })
  return ids.map((id) => id.toString())
}

/**
 * Throws unless the actor may act on this person.
 *
 * Used by the call sites that check one target at a time — assigning a task,
 * opening a profile, adding someone to a group.
 */
export async function assertWithinScope(actor, targetUserId, message, code = 'SCOPE_FORBIDDEN') {
  if (hasUnscopedAccess(actor)) return
  const allowed = await scopedUserIdsFor(actor)
  if (!allowed.includes(String(targetUserId))) {
    throw ApiError.forbidden(message, code)
  }
}

/**
 * Throws unless the actor may act on everyone in this department.
 *
 * Distinct from the id check above because some call sites act on a
 * department *before* any user exists — creating an account, filtering a
 * list. A TEAM-scoped actor is held to their own department here too: the
 * alternative is deciding what "create a user in a team" means, which is a
 * question for whoever asks for it rather than something to invent now.
 */
export async function assertDepartmentWithinScope(actor, department, message, code = 'DEPARTMENT_SCOPE_FORBIDDEN') {
  if (hasUnscopedAccess(actor)) return
  const own = await actorDepartmentFor(actor)
  if (!own || department !== own) {
    throw ApiError.forbidden(message, code)
  }
}
