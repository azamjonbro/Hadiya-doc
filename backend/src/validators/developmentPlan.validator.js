import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

const GOAL_STATUSES = ['PLANNED', 'IN_PROGRESS', 'ACHIEVED', 'DROPPED']

const goalBase = {
  type: z.enum(['COURSE', 'COMPETENCY', 'OJT', 'CUSTOM']),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  courseId: objectId.nullable().optional(),
  competencyId: objectId.nullable().optional(),
  targetLevel: z.coerce.number().int().min(0).max(10).nullable().optional(),
  // Not an objectId: the OJT checklist (13.3) is being written beside this
  // and its id shape is not settled. A loose string keeps the seam open
  // without pretending to validate somebody else's model.
  ojtChecklistId: z.string().trim().max(64).nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  weight: z.coerce.number().int().min(1).max(10).optional(),
  cpeCredits: z.coerce.number().int().min(0).max(1000).optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  manualProgress: z.coerce.number().int().min(0).max(100).optional(),
}

/**
 * A goal has to point at something real.
 *
 * A COURSE goal with no course would render as a progress bar reading 0%
 * forever, looking exactly like somebody who has not started — the same
 * failure an onboarding COURSE step with no refId used to produce.
 */
const goalSchema = z
  .object(goalBase)
  .refine((goal) => goal.type !== 'COURSE' || Boolean(goal.courseId), {
    message: 'A course goal needs a course',
    path: ['courseId'],
  })
  .refine((goal) => goal.type !== 'COMPETENCY' || Boolean(goal.competencyId), {
    message: 'A competency goal needs a competency',
    path: ['competencyId'],
  })

export const createPlanSchema = z
  .object({
    userId: objectId,
    managerId: objectId.nullable().optional(),
    title: z.string().trim().min(1).max(200),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    status: z.enum(['DRAFT', 'ACTIVE']).optional(),
    goals: z.array(goalSchema).max(50).optional(),
  })
  .refine((plan) => plan.periodEnd > plan.periodStart, {
    message: 'The period has to end after it starts',
    path: ['periodEnd'],
  })

export const updatePlanSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    managerId: objectId.nullable().optional(),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'REVIEWED', 'COMPLETED', 'ARCHIVED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const addGoalSchema = goalSchema

// `type` is absent on purpose: changing a goal's kind would leave it
// carrying the wrong base level and reading its progress off the wrong
// record. Delete it and add the right one.
export const updateGoalSchema = z
  .object({
    title: goalBase.title.optional(),
    description: goalBase.description,
    targetLevel: goalBase.targetLevel,
    targetDate: goalBase.targetDate,
    weight: goalBase.weight,
    cpeCredits: goalBase.cpeCredits,
    ojtChecklistId: goalBase.ojtChecklistId,
    status: goalBase.status,
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const goalProgressSchema = z
  .object({
    progressPercent: z.coerce.number().int().min(0).max(100).optional(),
    status: z.enum(GOAL_STATUSES).optional(),
  })
  .refine((data) => data.progressPercent !== undefined || data.status !== undefined, {
    message: 'Nothing to record',
  })

export const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  period: z.string().trim().max(60).optional(),
  overallRating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().trim().max(5000).optional(),
  goalComments: z
    .array(
      z.object({
        goalId: objectId,
        comment: z.string().trim().max(2000).optional(),
        progressPercent: z.coerce.number().int().min(0).max(100).optional(),
        status: z.enum(GOAL_STATUSES).optional(),
      })
    )
    .max(50)
    .optional(),
  // Closing the cycle rather than only signing this round off.
  completePlan: z.boolean().optional(),
})

export const listPlansQuerySchema = z.object({
  userId: objectId.optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'REVIEWED', 'COMPLETED', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const dueQuerySchema = z.object({
  withinDays: z.coerce.number().int().min(1).max(365).default(14),
})

// ----- plan types and templates (rasn 12–14) -----
const outcomeSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  positive: z.boolean().optional().default(true),
})

export const createPlanTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(''),
  outcomes: z.array(outcomeSchema).min(1).max(10),
  status: z.enum(['PUBLISHED', 'HIDDEN']).optional(),
})

export const updatePlanTypeSchema = createPlanTypeSchema.partial()

const templateGoalSchema = z.object({
  type: z.enum(['COURSE', 'COMPETENCY', 'OJT', 'CUSTOM']),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  courseId: objectId.nullable().optional(),
  competencyId: objectId.nullable().optional(),
  targetLevel: z.number().int().min(0).max(10).nullable().optional(),
  ojtChecklistId: z.string().nullable().optional(),
  dueInDays: z.number().int().min(0).max(3650).nullable().optional(),
  weight: z.number().int().min(1).max(10).optional().default(1),
  cpeCredits: z.number().min(0).max(1000).optional().default(0),
})

export const createPlanTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  typeId: objectId,
  description: z.string().trim().max(2000).optional().default(''),
  cover: z.string().optional().default(''),
  durationDays: z.number().int().min(1).max(3650).optional().default(90),
  goals: z.array(templateGoalSchema).max(50).optional().default([]),
  status: z.enum(['PUBLISHED', 'HIDDEN']).optional(),
})

export const updatePlanTemplateSchema = createPlanTemplateSchema.partial()

export const assignTemplateSchema = z
  .object({
    userIds: z.array(objectId).min(1).max(200),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date().optional(),
    status: z.enum(['DRAFT', 'ACTIVE']).optional(),
  })
  .refine((body) => !body.periodEnd || body.periodEnd > body.periodStart, {
    message: 'The period has to end after it starts',
    path: ['periodEnd'],
  })
