/**
 * Seeded roles. The `roles` collection in MongoDB is the actual source of
 * truth at runtime — this list only seeds the six initial rows. New roles
 * can be added later purely as data, with no code change required.
 */
export const ROLES = Object.freeze({
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  CALL_OPERATOR: 'CALL_OPERATOR',
  SELLER: 'SELLER',
  // §8.2's three specialist roles. Each does one job with courses and is
  // never a general admin — which is the point: until now the only way to
  // let somebody write a course was to make them an ADMIN, and that hands
  // them every employee record with it.
  AUTHOR: 'AUTHOR',
  INSTRUCTOR: 'INSTRUCTOR',
  MENTOR: 'MENTOR',
})

export const SYSTEM_ROLE_NAMES = Object.values(ROLES)

/**
 * How far a role can see, as data on the role rather than a hard-coded name.
 *
 * Until 2.2 the fence was `roleName === 'MANAGER'`, which meant a custom
 * role created through the API — the whole point of roles being data — came
 * out unscoped: give it `user:read` and it could read the entire company
 * (AT-21). Scope is now a field, so a new role is as narrow as it is set to
 * be and nothing has to know its name.
 *
 *   ALL         no fence; admin-tier
 *   DEPARTMENT  everyone in the actor's own department
 *   TEAM        everyone below the actor in the org chart (2.1)
 *   SELF        only themselves
 */
export const ROLE_SCOPES = Object.freeze({
  ALL: 'ALL',
  DEPARTMENT: 'DEPARTMENT',
  TEAM: 'TEAM',
  SELF: 'SELF',
})

export const ROLE_SCOPE_VALUES = Object.values(ROLE_SCOPES)

/**
 * The scopes the seeded roles get. MANAGER is DEPARTMENT because that is
 * exactly what the hard-coded checks did — this refactor must not change
 * what an existing manager can reach, only make it configurable.
 */
export const DEFAULT_ROLE_SCOPES = Object.freeze({
  [ROLES.SUPERADMIN]: ROLE_SCOPES.ALL,
  [ROLES.ADMIN]: ROLE_SCOPES.ALL,
  [ROLES.MANAGER]: ROLE_SCOPES.DEPARTMENT,
  [ROLES.EMPLOYEE]: ROLE_SCOPES.SELF,
  [ROLES.CALL_OPERATOR]: ROLE_SCOPES.SELF,
  [ROLES.SELLER]: ROLE_SCOPES.SELF,
  // AUTHOR and INSTRUCTOR work on content, not on people: §8.2 gives them
  // no user:read at all, so there is nothing for a wider scope to widen.
  [ROLES.AUTHOR]: ROLE_SCOPES.SELF,
  [ROLES.INSTRUCTOR]: ROLE_SCOPES.SELF,
  // MENTOR is the one that reads employee records, and TEAM is what makes
  // that safe — their mentees, not the company.
  [ROLES.MENTOR]: ROLE_SCOPES.TEAM,
})

/**
 * A role with no scope recorded — an old document, or a token issued before
 * 2.2 — is read as narrowly as its name allows rather than as ALL. Widening
 * by default is how a migration turns into a data leak.
 */
export function resolveRoleScope(role) {
  const stored = typeof role === 'string' ? null : role?.scope
  if (stored && ROLE_SCOPE_VALUES.includes(stored)) return stored
  const name = typeof role === 'string' ? role : role?.name
  return DEFAULT_ROLE_SCOPES[name] ?? ROLE_SCOPES.SELF
}

export function isUnscoped(scope) {
  return scope === ROLE_SCOPES.ALL
}

/**
 * Several roles worn at once (an EMPLOYEE who is also a MENTOR), folded
 * into the one shape the rest of the code reads: `permissions` is the
 * union, `scope` the widest, and `name` / `_id` come from the *primary*
 * role — the widest-scoped one, SUPERADMIN ahead of everything, then the
 * one with more permissions — so a name-based check ("is this a
 * SUPERADMIN?") answers for the most powerful hat, never the least. The
 * whole set is kept on `names` for anything that wants to know all of them.
 */
const SCOPE_RANK = { [ROLE_SCOPES.ALL]: 0, [ROLE_SCOPES.DEPARTMENT]: 1, [ROLE_SCOPES.TEAM]: 2, [ROLE_SCOPES.SELF]: 3 }

export function rankRole(role) {
  const scope = SCOPE_RANK[resolveRoleScope(role)] ?? 3
  const superadmin = role?.name === ROLES.SUPERADMIN ? 0 : 1
  return scope * 10 + superadmin - Math.min(9, (role?.permissions?.length ?? 0) / 1000)
}

export function mergeRoles(roles) {
  const list = (roles ?? []).filter(Boolean)
  if (list.length === 0) return null
  const sorted = [...list].sort((a, b) => rankRole(a) - rankRole(b))
  const primary = sorted[0]
  if (sorted.length === 1) return { ...(primary.toObject?.() ?? primary), _id: primary._id, name: primary.name, names: [primary.name] }
  const permissions = [...new Set(sorted.flatMap((role) => role.permissions ?? []))]
  return {
    _id: primary._id,
    name: primary.name,
    isSystem: primary.isSystem,
    scope: resolveRoleScope(primary),
    permissions,
    names: sorted.map((role) => role.name),
    roles: sorted,
  }
}
