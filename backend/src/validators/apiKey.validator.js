import { z } from 'zod'

export const createApiKeySchema = z.object({
  // A name is required because "which key is this?" is the first question
  // asked of any key list six months later.
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.string().min(1).max(60)).min(1).max(20),
  includePii: z.boolean().optional().default(false),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(6000).optional(),
  expiresAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Not a date' })
    .optional(),
})
