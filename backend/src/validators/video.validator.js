import { z } from 'zod'

export const updateVideoSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    order: z.coerce.number().int().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })
