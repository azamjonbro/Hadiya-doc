import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const raterGroup = z.enum(['SELF', 'MANAGER', 'PEER', 'SUBORDINATE'])

const questionSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    type: z.enum(['RATING', 'TEXT']).optional(),
    competencyId: objectId.nullable().optional(),
    scaleMax: z.coerce.number().int().min(2).max(10).optional(),
    required: z.boolean().optional(),
    order: z.coerce.number().int().min(0).max(1000).optional(),
    groups: z.array(raterGroup).min(1).optional(),
  })
  .refine(
    // A question nobody is asked is invisible in every screen but the
    // template editor, so it looks like the template lost it.
    (question) => question.type !== 'TEXT' || question.scaleMax === undefined,
    { message: 'A text question has no scale', path: ['scaleMax'] }
  )

const templateShape = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  questions: z.array(questionSchema).max(100).optional(),
  raterGroups: z.array(raterGroup).min(1).optional(),
  maxPeers: z.coerce.number().int().min(0).max(50).optional(),
  maxSubordinates: z.coerce.number().int().min(0).max(50).optional(),
  anonymousGroups: z.array(raterGroup).optional(),
  // Floored at 2 rather than 1: a "threshold" of one reveals a single
  // person's answers while calling itself anonymity, which is worse than
  // saying plainly that the group is attributed.
  anonymityThreshold: z.coerce.number().int().min(2).max(20).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
}

export const createTemplateSchema = z.object(templateShape)

export const updateTemplateSchema = z
  .object(Object.fromEntries(Object.entries(templateShape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

const cycleShape = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  templateId: objectId,
  subjectIds: z.array(objectId).min(1).max(500),
  dueAt: z.coerce.date().nullable().optional(),
  postToCompetencies: z.boolean().optional(),
}

export const createCycleSchema = z.object(cycleShape)

export const updateCycleSchema = z
  .object(Object.fromEntries(Object.entries(cycleShape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listCyclesQuerySchema = z.object({
  status: z.enum(['DRAFT', 'RUNNING', 'CLOSED']).optional(),
})

export const listTemplatesQuerySchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
})

export const myAssignmentsQuerySchema = z.object({
  status: z.enum(['PENDING', 'SUBMITTED', 'ALL']).optional(),
})

export const submitResponseSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: objectId,
        // Nullable so "asked but skipped" is expressible for an optional
        // question; the service is what decides whether skipping is allowed.
        rating: z.coerce.number().int().min(0).max(10).nullable().optional(),
        text: z.string().trim().max(4000).optional(),
      })
    )
    .max(100),
})
