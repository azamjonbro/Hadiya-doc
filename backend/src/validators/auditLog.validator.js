import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

// Actions are code-defined identifiers (REPORT_EXPORTED, LOGIN_FAILED, …).
// Constraining the shape here keeps an arbitrary string out of the query and
// makes the filter an equality match rather than anything pattern-like.
const actionName = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'Invalid action')
const entityName = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/, 'Invalid entity')

const filters = {
  actor: objectId.optional(),
  action: actionName.optional(),
  entity: entityName.optional(),
  entityId: z.string().max(128).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
}

export const auditLogListQuerySchema = z.object({
  ...filters,
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
})

// No page/limit: an export is the whole filtered set by definition, and it is
// streamed rather than paged.
export const auditLogExportQuerySchema = z.object(filters)
