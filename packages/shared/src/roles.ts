/**
 * Seeded roles. The `roles` collection in MongoDB is the actual source of
 * truth at runtime — this list only seeds the six initial rows. New roles
 * can be added later purely as data, with no code change required.
 */
export const ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  CALL_OPERATOR: 'CALL_OPERATOR',
  SELLER: 'SELLER',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

export const SYSTEM_ROLE_NAMES: RoleName[] = Object.values(ROLES)
