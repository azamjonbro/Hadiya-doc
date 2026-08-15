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

export const upsertQuizSchema = z.object({
  passScorePercent: z.coerce.number().min(0).max(100).optional(),
  questions: z.array(questionSchema).min(1),
})

export const submitQuizSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedOptionIndex: z.coerce.number().int().min(0),
      })
    )
    .min(1),
})
