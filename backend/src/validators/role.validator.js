import { z } from 'zod'

export const roleNameSchema = z.object({
  name: z.string().trim().min(2, 'Role name is required').max(40, 'Role name is too long'),
})
