import { z } from 'zod'

export const updateVideoSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    order: z.coerce.number().int().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    pointsEnabled: z.boolean().optional(),
    points: z.coerce.number().int().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

/**
 * The metadata beside an uploaded caption file (9.4).
 *
 * Multipart, so everything arrives as a string — including the boolean,
 * where "false" is truthy if it is not coerced.
 */
export const addSubtitleSchema = z.object({
  lang: z.string().trim().min(2).max(8),
  label: z.string().trim().max(60).optional(),
  isDefault: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => (typeof value === 'string' ? value === 'true' : value)),
})
