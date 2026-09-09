import { z } from 'zod'
import { QUESTION_TYPES } from '../models/question.model.js'

/**
 * The payload shapes the model deliberately does not enforce.
 *
 * `question.payload` is Mixed in mongoose because fourteen types have
 * nothing structural in common, so the check has to happen where a bad one
 * arrives: here. A question stored with the wrong shape is not a validation
 * error later, it is a question that silently grades everyone as wrong.
 */

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const shortText = z.string().trim().min(1).max(500)

const optionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  text: shortText,
  isCorrect: z.boolean().optional().default(false),
  feedback: z.string().trim().max(500).optional(),
})

// One entry per type. The keys are exactly QUESTION_TYPES — the test asserts
// that, so a type added to the model without a shape here fails loudly
// rather than accepting anything.
export const PAYLOAD_SCHEMAS = {
  SINGLE_CHOICE: z.object({
    options: z
      .array(optionSchema)
      .min(2)
      .max(20)
      // Exactly one, or the question has no answer / two answers, and the
      // grader would silently pick the first.
      .refine((options) => options.filter((option) => option.isCorrect).length === 1, {
        message: 'A single-choice question needs exactly one correct option',
      }),
  }),
  MULTI_CHOICE: z.object({
    options: z
      .array(optionSchema)
      .min(2)
      .max(20)
      .refine((options) => options.some((option) => option.isCorrect), {
        message: 'A multiple-choice question needs at least one correct option',
      }),
  }),
  TRUE_FALSE: z.object({ correct: z.boolean() }),
  SHORT_ANSWER: z.object({
    accepted: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    caseSensitive: z.boolean().optional().default(false),
  }),
  NUMERIC: z.object({
    value: z.number(),
    tolerance: z.number().min(0).optional().default(0),
  }),
  MATCHING: z.object({
    pairs: z.array(z.object({ left: shortText, right: shortText })).min(2).max(20),
  }),
  SEQUENCE: z.object({
    // Stored in the correct order; the attempt shuffles them.
    items: z.array(shortText).min(2).max(20),
  }),
  FILL_BLANK: z.object({
    template: z.string().trim().min(1).max(2000),
    blanks: z
      .array(
        z.object({
          accepted: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
          caseSensitive: z.boolean().optional(),
        })
      )
      .min(1)
      .max(20),
    caseSensitive: z.boolean().optional().default(false),
  }),
  SELECT_LIST: z.object({
    blanks: z
      .array(
        z.object({
          options: z.array(shortText).min(2).max(20),
          correctIndex: z.number().int().min(0),
        })
      )
      .min(1)
      .max(20)
      .refine((blanks) => blanks.every((blank) => blank.correctIndex < blank.options.length), {
        message: 'correctIndex must point at one of the options',
      }),
  }),
  HOTSPOT: z.object({
    imageKey: z.string().trim().min(1).max(500),
    areas: z
      .array(
        z.object({
          // Percentages of the image, like the certificate template's
          // fields — the same reason: the image is displayed at whatever
          // size the screen allows.
          x: z.number().min(0).max(100),
          y: z.number().min(0).max(100),
          w: z.number().min(0).max(100),
          h: z.number().min(0).max(100),
          isCorrect: z.boolean().optional().default(false),
        })
      )
      .min(1)
      .max(20)
      .refine((areas) => areas.some((area) => area.isCorrect), {
        message: 'A hotspot question needs at least one correct area',
      }),
  }),
  LIKERT: z.object({
    scale: z.number().int().min(2).max(10),
    labels: z.array(shortText).max(10).optional().default([]),
  }),
  DRAG_DROP: z.object({
    zones: z.array(z.object({ id: z.string().trim().min(1).max(64), label: shortText })).min(1).max(20),
    items: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(64),
          text: shortText,
          zoneId: z.string().trim().min(1).max(64),
        })
      )
      .min(1)
      .max(40),
  }),
  ESSAY: z.object({
    minWords: z.number().int().min(0).max(10000).optional().default(0),
    maxWords: z.number().int().min(0).max(10000).optional().default(0),
    rubricId: objectId.nullable().optional(),
  }),
}

// Identical shape, different editor — see the note in question.model.js.
PAYLOAD_SCHEMAS.DRAG_WORDS = PAYLOAD_SCHEMAS.DRAG_DROP

const baseQuestion = {
  bankId: objectId,
  type: z.enum(QUESTION_TYPES),
  text: z.string().trim().min(1).max(2000),
  explanation: z.string().trim().max(2000).optional(),
  points: z.number().min(0).max(1000).optional(),
  penalty: z.number().min(0).max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  media: z
    .object({
      key: z.string().trim().max(500).optional(),
      type: z.enum(['IMAGE', 'AUDIO', 'VIDEO']).optional(),
      altText: z.string().trim().max(500).optional(),
    })
    .optional(),
}

/**
 * The payload is validated against the schema for *this* question's type.
 *
 * `superRefine` rather than a discriminated union: the union would need
 * fourteen full object schemas repeating every base field, and the error it
 * produces on a bad type is unreadable.
 */
export const createQuestionSchema = z
  .object({ ...baseQuestion, payload: z.unknown() })
  .superRefine((data, ctx) => {
    const schema = PAYLOAD_SCHEMAS[data.type]
    if (!schema) return
    const result = schema.safeParse(data.payload)
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload'],
        message: result.error.issues[0]?.message ?? 'Invalid payload for this question type',
      })
      return
    }
    data.payload = result.data
  })

export const updateQuestionSchema = z
  .object({
    ...Object.fromEntries(Object.entries(baseQuestion).map(([key, schema]) => [key, schema.optional()])),
    payload: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.payload === undefined) return
    // A payload can only be checked against a type, so changing one without
    // stating the other is refused rather than validated against a guess.
    if (!data.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['type'],
        message: 'Send the question type alongside a new payload',
      })
      return
    }
    const result = PAYLOAD_SCHEMAS[data.type]?.safeParse(data.payload)
    if (result && !result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload'],
        message: result.error.issues[0]?.message ?? 'Invalid payload for this question type',
      })
      return
    }
    if (result) data.payload = result.data
  })

export const questionBankCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  courseId: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
})

export const questionBankUpdateSchema = questionBankCreateSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listQuestionsQuerySchema = z.object({
  bankId: objectId.optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  tag: z.string().trim().max(40).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: objectId.optional(),
})
