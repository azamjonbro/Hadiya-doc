import { z } from 'zod'

export const createQuestionSchema = z.object({
  question: z.string().trim().min(1, 'Question is required').max(2000),
})

export const createAnswerSchema = z.object({
  answer: z.string().trim().min(1, 'Answer is required').max(2000),
})

export const listQuestionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
