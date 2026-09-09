import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

const shape = {
  topicId: objectId,
  courseId: objectId,
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(10000).optional(),
  submissionTypes: z.array(z.enum(['FILE', 'TEXT', 'LINK'])).min(1).max(3).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  allowLate: z.boolean().optional(),
  lateWindowHours: z.coerce.number().int().min(0).max(8760).optional(),
  maxAttempts: z.coerce.number().int().min(0).max(20).optional(),
  rubricId: objectId.nullable().optional(),
  maxScore: z.coerce.number().min(0).max(10000).optional(),
  reviewerIds: z.array(objectId).max(50).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
}

export const createAssignmentSchema = z.object(shape)

export const updateHomeworkSchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const submitWorkSchema = z.object({
  text: z.string().max(50000).optional(),
  files: z
    .array(
      z.object({
        // A storage key produced by the upload endpoint. Never a
        // client-chosen path — the same rule as every other upload.
        key: z.string().trim().min(1).max(500),
        name: z.string().trim().max(300).optional(),
        size: z.coerce.number().int().min(0).optional(),
        mime: z.string().trim().max(120).optional(),
      })
    )
    .max(20)
    .optional(),
  links: z.array(z.string().trim().url('Each link has to be a URL').max(1000)).max(20).optional(),
})

export const gradeSubmissionSchema = z.object({
  score: z.coerce.number().min(0).max(10000).optional(),
  feedback: z.string().trim().max(10000).optional(),
  rubricScores: z
    .array(
      z.object({
        criterionId: objectId,
        score: z.coerce.number().min(0).max(10000),
        comment: z.string().trim().max(2000).optional(),
      })
    )
    .max(50)
    .optional(),
  // Sending it back for another go, rather than closing it. The difference
  // matters to the learner, who otherwise sees a grade and assumes it final.
  returnForRevision: z.boolean().optional(),
})

export const createRubricSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  criteria: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1000).optional(),
        maxScore: z.coerce.number().min(0).max(1000),
        levels: z
          .array(z.object({ label: z.string().trim().min(1).max(120), score: z.coerce.number().min(0).max(1000) }))
          .max(10)
          .optional(),
      })
    )
    .min(1)
    .max(20),
})

export const listAssignmentsQuerySchema = z.object({
  courseId: objectId.optional(),
  topicId: objectId.optional(),
})

export const gradingQueueQuerySchema = z.object({
  courseId: objectId.optional(),
  assignmentId: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})
