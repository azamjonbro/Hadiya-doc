import { z } from 'zod'

export const directoryQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  branch: z.string().trim().max(100).optional().default(''),
  department: z.string().trim().max(100).optional().default(''),
  subdivision: z.string().trim().max(100).optional().default(''),
  // A query string carries 'true', not true.
  newOnly: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
})
