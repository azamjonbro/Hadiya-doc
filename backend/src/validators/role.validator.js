import { z } from 'zod'
import { ROLE_SCOPE_VALUES, ROLE_SCOPES } from '@lms/shared'

export const roleNameSchema = z.object({
  name: z.string().trim().min(2, 'Role name is required').max(40, 'Role name is too long'),
  // How far the role can see. Defaults to the narrowest option rather than
  // to ALL: a role created without saying how far it reaches should reach as
  // little as possible (AT-21).
  scope: z.enum(ROLE_SCOPE_VALUES).optional().default(ROLE_SCOPES.SELF),
})
