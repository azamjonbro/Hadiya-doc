import { z } from 'zod'

export const reportExportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx', 'pdf']),
})
