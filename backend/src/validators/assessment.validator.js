import { z } from 'zod'

const optionSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean(),
})

const questionSchema = z
  .object({
    text: z.string().min(1),
    order: z.coerce.number().int().optional(),
    options: z.array(optionSchema).min(2),
  })
  .refine((q) => q.options.filter((o) => o.isCorrect).length === 1, {
    message: 'Each question must have exactly one correct option',
    path: ['options'],
  })

export const createAssessmentSchema = z.object({
  title: z.string().min(1),
  order: z.coerce.number().int().optional(),
})

export const updateAssessmentSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    passScorePercent: z.coerce.number().min(0).max(100).optional(),
    pointsEnabled: z.boolean().optional(),
    points: z.coerce.number().int().min(0).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    order: z.coerce.number().int().optional(),
    questions: z.array(questionSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIndex: z.coerce.number().int().min(0),
})

// Empty is allowed: when the 15 minutes run out the client submits whatever
// was filled in, and "nothing" is a legitimate answer set that still has to
// close the sitting and be graded as a zero.
export const submitAssessmentSchema = z.object({
  answers: z.array(answerSchema).default([]),
})

// Unlike a submit, a focus-loss report can legitimately carry nothing: the
// tab may have been left before a single question was answered, and that
// sitting still has to be graded (as a zero) rather than rejected.
export const assessmentFocusLossSchema = z.object({
  answers: z.array(answerSchema).default([]),
})
