import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

/**
 * One block, validated per type (9.1).
 *
 * A discriminated union rather than one permissive object: a HEADING with no
 * text and an IMAGE with no url are both nonsense, and a shared shape where
 * everything is optional cannot say so. Each of the eight types the editor
 * gains in 9.2 is one more entry in this list.
 *
 * `id` is optional and, when present, is the id of the block being edited —
 * reading progress is recorded against it, so a paragraph that keeps its id
 * keeps everyone's place in the lesson.
 */
const headingBlock = z.object({
  id: objectId.optional(),
  type: z.literal('HEADING'),
  text: z.string().trim().min(1).max(300),
  // h1 is the lesson title; a heading inside it starts at h2. Skipping
  // levels is what makes a page unnavigable with a screen reader.
  level: z.coerce.number().int().min(2).max(4).optional(),
})

const textBlock = z.object({
  id: objectId.optional(),
  type: z.literal('TEXT'),
  // Rich HTML, sanitised server-side against the knowledge base's allowlist
  // (lessonBlocks.js). The cap is a paragraph limit, not a lesson limit —
  // a wall of text belongs in several blocks, which is also how a reader's
  // progress through it becomes measurable.
  text: z.string().min(1).max(20000),
})

const imageBlock = z.object({
  id: objectId.optional(),
  type: z.literal('IMAGE'),
  url: z
    .string()
    .url()
    // `z.string().url()` accepts `javascript:` and `data:` — both are URLs.
    // Only the two schemes an <img> may load are allowed; origin-pinning to
    // our own storage waits for the media library (9.5).
    .refine((value) => /^https?:\/\//i.test(value), { message: 'Image URL must be http(s)' }),
  alt: z.string().max(300).optional(),
  caption: z.string().max(500).optional(),
})

const dividerBlock = z.object({
  id: objectId.optional(),
  type: z.literal('DIVIDER'),
})

const lessonBlock = z.discriminatedUnion('type', [headingBlock, textBlock, imageBlock, dividerBlock])

// A lesson is a page, not a book. Two hundred blocks is already far past
// what anybody scrolls, and an unbounded array is a document that cannot be
// loaded once it exists.
const blocks = z.array(lessonBlock).max(200)

export const createLessonSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  blocks: blocks.optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  required: z.boolean().optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(600).optional(),
  order: z.coerce.number().int().optional(),
})

export const updateLessonSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    // An empty array is a real instruction — "this lesson is empty again" —
    // and is why the service distinguishes it from an absent field.
    blocks: blocks.optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    required: z.boolean().optional(),
    estimatedMinutes: z.coerce.number().int().min(0).max(600).optional(),
    order: z.coerce.number().int().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

/**
 * The blocks a reader has actually had on screen.
 *
 * A set per report rather than one id at a time: scrolling through a page
 * passes four blocks in a second, and four requests for one scroll is the
 * kind of chatter that makes a reading page feel like a game.
 */
export const lessonProgressSchema = z.object({
  blockIds: z.array(objectId).min(1).max(200),
})
