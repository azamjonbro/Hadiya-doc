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
