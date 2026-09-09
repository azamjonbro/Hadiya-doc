import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

// Exactly the keys the renderer knows how to fill. An unknown key would
// draw nothing and look like a broken template rather than a rejected one.
const FIELD_KEYS = ['fullName', 'courseTitle', 'issuedAt', 'serial', 'score', 'validUntil', 'qr']

const fieldSchema = z.object({
  key: z.enum(FIELD_KEYS),
  // Page percentages, the same coordinates the model stores and the editor
  // drags in. Bounded here as well as in the schema so a bad drag comes back
  // as a validation error instead of a mongoose cast error.
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  fontSize: z.number().min(6).max(96).optional(),
  bold: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Colour must be #rrggbb').optional(),
  size: z.number().min(4).max(40).optional(),
})

export const certificateTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  backgroundKey: z.string().trim().max(500).optional(),
  orientation: z.enum(['landscape', 'portrait']).optional(),
  pageSize: z.string().trim().max(20).optional(),
  fields: z.array(fieldSchema).max(20).optional(),
  validityDays: z.number().int().min(0).max(3650).optional(),
  isDefault: z.boolean().optional(),
})

export const certificateTemplateUpdateSchema = certificateTemplateCreateSchema.partial()

export const certificateListQuerySchema = z.object({
  status: z.enum(['VALID', 'EXPIRED', 'REVOKED']).optional(),
  search: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: objectId.optional(),
})

export const certificateRevokeSchema = z.object({
  reason: z.string().trim().max(500).optional().default(''),
})
