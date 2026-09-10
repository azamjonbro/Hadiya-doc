import { z } from 'zod'

/**
 * Multipart when a document is attached, JSON when it is not — so every
 * field has to survive arriving as a string.
 */
export const outlineRequestSchema = z.object({
  // Either this or a file; the controller enforces "at least one" because
  // the file is not part of the body.
  topic: z.string().trim().min(3).max(300).optional(),
  lessonCount: z.coerce.number().int().min(1).max(40).optional(),
  // The language the course is written in. Three, because those are the
  // three the platform itself speaks (i18n/locales) — a course in a
  // language the interface cannot label is not useful.
  lang: z.enum(['Uzbek', 'Russian', 'English']).optional().default('Uzbek'),
})

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

/**
 * Questions from a module, a topic or a document.
 *
 * `types` arrives as a repeated field in multipart and as an array in JSON,
 * so a single value is lifted into an array rather than rejected.
 */
export const quizRequestSchema = z.object({
  topicId: objectId.optional(),
  topic: z.string().trim().min(3).max(300).optional(),
  bankId: objectId.optional(),
  count: z.coerce.number().int().min(1).max(40).optional().default(10),
  lang: z.enum(['Uzbek', 'Russian', 'English']).optional().default('Uzbek'),
  types: z
    .union([
      z.enum(['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']),
      z.array(z.enum(['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'])).min(1),
    ])
    .optional()
    .transform((value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value])),
})
