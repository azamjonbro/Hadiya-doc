import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

const poolSchema = z.object({
  bankId: objectId,
  count: z.coerce.number().int().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  difficulty: z.enum(['', 'EASY', 'MEDIUM', 'HARD']).optional(),
})

const shape = {
  scope: z.enum(['VIDEO', 'TOPIC', 'COURSE', 'PATH']),
  scopeId: objectId,
  courseId: objectId.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  questionIds: z.array(objectId).max(200).optional(),
  pools: z.array(poolSchema).max(10).optional(),
  passScorePercent: z.coerce.number().int().min(0).max(100).optional(),
  // 0 means unlimited for both of these, which is why the floor is 0 and
  // not 1 — the model treats them the same way.
  maxAttempts: z.coerce.number().int().min(0).max(100).optional(),
  timeLimitMinutes: z.coerce.number().int().min(0).max(600).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  partialCredit: z.boolean().optional(),
  revealMode: z.enum(['NEVER', 'AFTER_SUBMIT', 'AFTER_PASS', 'AFTER_LAST_ATTEMPT']).optional(),
  scorePolicy: z.enum(['LAST', 'BEST', 'FIRST', 'AVERAGE']).optional(),
  focusLossLimit: z.coerce.number().int().min(0).max(20).optional(),
  pointsEnabled: z.boolean().optional(),
  points: z.coerce.number().int().min(0).max(1000).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
}

export const createTestQuizSchema = z.object(shape).refine(
  // A test with neither fixed questions nor a pool has nothing to ask, and
  // a learner starting it would get an empty paper rather than an error.
  (data) => (data.questionIds?.length ?? 0) > 0 || (data.pools?.length ?? 0) > 0 || data.status !== 'PUBLISHED',
  { message: 'A published test needs at least one question or one pool' }
)

export const updateTestQuizSchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listTestQuizzesQuerySchema = z.object({
  scope: z.enum(['VIDEO', 'TOPIC', 'COURSE', 'PATH']).optional(),
  scopeId: objectId.optional(),
  courseId: objectId.optional(),
})
