import { z } from 'zod'
import { REPORT_LANGS, DEFAULT_REPORT_LANG } from '../services/reports/reportI18n.js'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

export const reportExportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx', 'pdf']),
  // The language the admin is looking at — the exported file is written in it.
  lang: z.enum(REPORT_LANGS).optional().default(DEFAULT_REPORT_LANG),
  role: z.string().optional(),
  userId: objectId.optional(),
  courseId: objectId.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})
