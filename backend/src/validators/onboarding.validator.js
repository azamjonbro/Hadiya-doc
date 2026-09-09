import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const nameList = z.array(z.string().trim().min(1).max(120)).max(50)

const stepSchema = z
  .object({
    type: z.enum(['COURSE', 'PATH', 'TASK', 'EVENT', 'ASSIGNMENT', 'KB_ARTICLE', 'MANUAL']),
    refId: objectId.nullable().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    dueDays: z.coerce.number().int().min(0).max(365).optional(),
    required: z.boolean().optional(),
    order: z.coerce.number().int().min(0).max(1000).optional(),
    ownerRole: z.enum(['EMPLOYEE', 'MANAGER', 'MENTOR', 'HR']).optional(),
  })
  .refine(
    // A COURSE or PATH step with nothing to point at would materialise into
    // no assignment and then sit PENDING forever, looking like the new hire
    // ignored it.
    (step) => !['COURSE', 'PATH'].includes(step.type) || Boolean(step.refId),
    { message: 'A course or path step needs something to point at', path: ['refId'] }
  )

const shape = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  targetRoles: nameList.optional(),
  departments: nameList.optional(),
  positions: nameList.optional(),
  branches: nameList.optional(),
  steps: z.array(stepSchema).max(100).optional(),
  autoStart: z.boolean().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
}

export const createProgramSchema = z.object(shape)

export const updateProgramSchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const startOnboardingSchema = z.object({
  userId: objectId,
  mentorId: objectId.nullable().optional(),
  startedAt: z.coerce.date().optional(),
})
