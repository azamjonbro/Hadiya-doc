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

/**
 * The on-screen preview (8.2).
 *
 * The same filters as an export minus `format`: there is no file, so there
 * is no format to choose. The row cap is deliberately not a parameter — a
 * client that could raise it could turn a preview into an unbounded read,
 * which is the thing the caps exist to stop.
 */
export const reportPreviewQuerySchema = reportExportQuerySchema.omit({ format: true })

/**
 * A scheduled report (8.4).
 *
 * `dayOfMonth` stops at 28 rather than 31, and that is the interesting line
 * here. "The 31st" does not exist in five months of the year, and every way
 * of handling it is a surprise: skipping means the report silently misses
 * February, clamping means "the 31st" quietly meant the 28th all along.
 * Refusing the value is the only version where the person choosing the day
 * finds out while they are choosing it.
 */
export const scheduledReportBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().min(1),
  // No PDF: the worker writes spreadsheets, and a hundred-thousand-row PDF
  // is not a document anybody opens.
  format: z.enum(['csv', 'xlsx']).optional().default('xlsx'),
  lang: z.enum(REPORT_LANGS).optional().default(DEFAULT_REPORT_LANG),
  filters: z
    .object({
      role: z.string().optional(),
      userId: objectId.optional(),
      courseId: objectId.optional(),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
    })
    .optional()
    .default({}),
  cadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).optional().default('WEEKLY'),
  hour: z.coerce.number().int().min(0).max(23).optional().default(7),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional().default(1),
  dayOfMonth: z.coerce.number().int().min(1).max(28).optional().default(1),
  recipients: z.array(objectId).max(50).optional().default([]),
  active: z.boolean().optional().default(true),
})

/** Every field optional — a schedule is edited a field at a time. */
export const scheduledReportPatchSchema = scheduledReportBodySchema.partial()
