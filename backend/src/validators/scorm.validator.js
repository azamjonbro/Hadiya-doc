import { z } from 'zod'

// The archive arrives as multipart, so this covers only the fields sent
// alongside it. Everything else about the package — its version, its launch
// file, its mastery score — is read from the manifest rather than typed in.
export const createScormSchema = z.object({
  title: z.string().trim().max(200).optional(),
  description: z.string().max(2000).optional(),
  order: z.coerce.number().int().optional(),
  // Multipart sends booleans as strings, and "false" is truthy.
  required: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => (typeof value === 'string' ? value === 'true' : value)),
})

export const updateScormSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    required: z.boolean().optional(),
    order: z.coerce.number().int().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

/**
 * A commit from the running content.
 *
 * The CMI tree is the content's own: element names are whatever its
 * authoring tool writes, so the keys cannot be enumerated here. What is
 * enforced is the shape — a flat map of strings, capped — because that is
 * the API contract, and because an unbounded blob written on every Commit
 * is a way to fill the database from inside an iframe.
 */
export const scormCommitSchema = z.object({
  cmi: z
    .record(z.string().max(200), z.union([z.string().max(65536), z.number(), z.boolean(), z.null()]))
    .refine((value) => Object.keys(value).length <= 2000, { message: 'Too many CMI elements' }),
  finished: z.boolean().optional().default(false),
})

export const scormTokenQuerySchema = z.object({
  token: z.string().min(10),
})
