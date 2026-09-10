import { z } from 'zod'

/**
 * Query shapes for the public API (11.1).
 *
 * Every list takes `page`/`limit` and an `updatedSince`-style filter,
 * because the two questions an integration asks are "give me everything"
 * once and "give me what changed" forever after.
 */
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const paging = {
  page: z.coerce.number().int().min(1).optional().default(1),
  // 200 is the ceiling: a page that takes a second to build is a page an
  // integration times out on, and a smaller page is one more cheap request.
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
}
// Accepts an ISO timestamp or a date. Rejected rather than ignored when
// unparseable: silently returning *everything* to a caller who asked for
// yesterday's changes is how a sync quietly re-imports the whole company.
const since = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Not a date' })
  .optional()

export const publicUsersSchema = z.object({
  ...paging,
  branch: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  updatedSince: since,
})

export const publicCoursesSchema = z.object({
  ...paging,
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  updatedSince: since,
})

export const publicAssignmentsSchema = z.object({
  ...paging,
  userId: objectId.optional(),
  courseId: objectId.optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED']).optional(),
  completedSince: since,
})

export const publicCertificatesSchema = z.object({
  ...paging,
  userId: objectId.optional(),
  issuedSince: since,
})
