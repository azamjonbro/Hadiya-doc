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
