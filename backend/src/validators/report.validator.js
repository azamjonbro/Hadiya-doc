import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

export const reportExportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx', 'pdf']),
  role: z.string().optional(),
  userId: objectId.optional(),
  courseId: objectId.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})
