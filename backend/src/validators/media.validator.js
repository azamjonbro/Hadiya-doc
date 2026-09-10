import { z } from 'zod'

export const mediaListSchema = z.object({
  folder: z.string().max(120).optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(40),
})

export const updateMediaSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    // An empty string is a real value here: it means "out of any folder".
    folder: z.string().max(120).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

// `apply` has to be asked for by name. A sweep that deleted because a flag
// defaulted to true is exactly the accident this guards against.
export const cleanupQuerySchema = z.object({
  apply: z.enum(['true', 'false']).optional().default('false'),
})
