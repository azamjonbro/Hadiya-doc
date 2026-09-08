import { z } from 'zod'
import { ROLE_SCOPE_VALUES, ROLE_SCOPES, ALL_PERMISSIONS } from '@lms/shared'

export const roleNameSchema = z.object({
  name: z.string().trim().min(2, 'Role name is required').max(40, 'Role name is too long'),
  // How far the role can see. Defaults to the narrowest option rather than
  // to ALL: a role created without saying how far it reaches should reach as
  // little as possible (AT-21).
  scope: z.enum(ROLE_SCOPE_VALUES).optional().default(ROLE_SCOPES.SELF),
})

// PATCH /roles/:id — the permission matrix saves a whole row at a time.
//
// The permission list is the complete set for the role, not a delta: a grid
// where every box is a checkbox has no notion of "unchanged", and merging a
// partial list would make unticking a box do nothing. Both fields are
// optional so the same endpoint can change only the scope.
export const updateRoleSchema = z
  .object({
    permissions: z
      .array(z.enum(ALL_PERMISSIONS, { message: 'Unknown permission key' }))
      .optional(),
    scope: z.enum(ROLE_SCOPE_VALUES).optional(),
  })
  .refine((body) => body.permissions !== undefined || body.scope !== undefined, {
    message: 'Nothing to change — send permissions, scope, or both',
  })
