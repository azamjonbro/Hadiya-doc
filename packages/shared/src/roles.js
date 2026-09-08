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
