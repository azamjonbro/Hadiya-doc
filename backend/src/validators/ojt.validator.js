import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

const checklistItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  criteria: z.string().trim().max(2000).optional(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
  required: z.boolean().optional(),
  // 0 is allowed: a step worth watching that should not move the
  // percentage — "introduce yourself to the shift" — is a real thing on a
  // list, and forcing it to weigh something distorts the score.
  weight: z.coerce.number().min(0).max(100).optional(),
  competencyId: objectId.nullable().optional(),
  competencyLevel: z.coerce.number().int().min(0).max(10).nullable().optional(),
})

const checklistShape = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  position: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  items: z.array(checklistItemSchema).max(100).optional(),
  passThresholdPercent: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
}

export const createChecklistSchema = z.object(checklistShape)

export const updateChecklistSchema = z
  .object(Object.fromEntries(Object.entries(checklistShape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listChecklistsSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  q: z.string().trim().max(120).optional(),
})

export const createSessionSchema = z.object({
  checklistId: objectId,
  traineeId: objectId,
  observerId: objectId,
  scheduledAt: z.coerce.date().optional(),
  location: z.string().trim().max(200).optional(),
})

export const listSessionsSchema = z.object({
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  traineeId: objectId.optional(),
  observerId: objectId.optional(),
  // "Only mine" even for somebody who could see more — the observer's own
  // screen, asked for explicitly rather than inferred from the permissions
  // they happen to hold.
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const recordObservationSchema = z.object({
  result: z.enum(['PASS', 'FAIL', 'NOT_OBSERVED']),
  note: z.string().trim().max(2000).optional(),
  // Stamped by the phone, so a verdict given at 09:40 in a basement does
  // not read as 11:15 in the car park when the queue finally drains (12.3).
  recordedAt: z.coerce.date().optional(),
})

export const completeSessionSchema = z.object({
  note: z.string().trim().max(2000).optional(),
})

export const signOffSchema = z.object({
  note: z.string().trim().max(2000).optional(),
})

export const cancelSessionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})
