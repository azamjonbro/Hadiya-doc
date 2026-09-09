import { z } from 'zod'

// The file itself arrives via multipart, not the JSON body — this only
// covers the metadata fields sent alongside it.
export const createMaterialMetaSchema = z.object({
  type: z.enum(['FILE', 'PRESENTATION', 'MULTIMEDIA']),
  title: z.string().min(1),
  description: z.string().optional(),
  order: z.coerce.number().int().optional(),
  // Multipart sends everything as a string, so the checkbox arrives as
  // "false" — which is truthy. Coerced here rather than in the controller,
  // where forgetting it would silently turn every restricted upload into a
  // downloadable one.
  allowDownload: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => (typeof value === 'string' ? value === 'true' : value)),
})

// `inline` is what the in-app viewer asks for; `attachment` is the download
// button. Anything else is a typo, not a third mode.
export const materialUrlQuerySchema = z.object({
  disposition: z.enum(['attachment', 'inline']).optional().default('attachment'),
})

export const updateMaterialSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    order: z.coerce.number().int().optional(),
    allowDownload: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

// One page turn. `totalPages` rides along on every report rather than being
// set once, because a reader can open the same document on another device
// before the first report ever lands.
export const materialPageSchema = z.object({
  page: z.coerce.number().int().min(1),
  totalPages: z.coerce.number().int().min(0).max(5000).optional().default(0),
})
