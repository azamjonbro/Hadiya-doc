import { z } from 'zod'
import { normalizeEmbed, EMBED_ALLOWLIST } from '../services/courses/lessonEmbeds.js'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

/**
 * One block, validated per type (9.1, extended to twelve in 9.2).
 *
 * A discriminated union rather than one permissive object: a HEADING with no
 * text and an IMAGE with no url are both nonsense, and a shared shape where
 * everything is optional cannot say so. Twelve types, twelve entries — the
 * union is also what makes the editor's per-type forms safe to trust, since
 * a form that sends the wrong field gets a 400 rather than a stored block
 * with an empty body.
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

const quoteBlock = z.object({
  id: objectId.optional(),
  type: z.literal('QUOTE'),
  text: z.string().min(1).max(4000),
  author: z.string().max(200).optional(),
})

const calloutBlock = z.object({
  id: objectId.optional(),
  type: z.literal('CALLOUT'),
  text: z.string().min(1).max(8000),
  variant: z.enum(['INFO', 'WARNING', 'SUCCESS', 'DANGER']).optional(),
})

const codeBlock = z.object({
  id: objectId.optional(),
  type: z.literal('CODE'),
  // Stored verbatim, rendered as text. A sample that mentions a tag has to
  // survive the round trip, so this one is not sanitised anywhere.
  text: z.string().min(1).max(20000),
  language: z.string().max(30).optional(),
})

const imageUrl = z
  .string()
  .url()
  // `z.string().url()` accepts `javascript:` and `data:` — both are URLs.
  // Only the two schemes an <img> may load are allowed; origin-pinning to
  // our own storage waits for the media library (9.5).
  .refine((value) => /^https?:\/\//i.test(value), { message: 'Image URL must be http(s)' })

const imageBlock = z.object({
  id: objectId.optional(),
  type: z.literal('IMAGE'),
  url: imageUrl,
  alt: z.string().max(300).optional(),
  caption: z.string().max(500).optional(),
})

const galleryBlock = z.object({
  id: objectId.optional(),
  type: z.literal('GALLERY'),
  items: z
    .array(
      z.object({
        url: imageUrl,
        alt: z.string().max(300).optional(),
        caption: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(24),
})

const embedBlock = z.object({
  id: objectId.optional(),
  type: z.literal('EMBED'),
  // Checked against the host allowlist here so the author gets a 400 that
  // names the problem, and normalised again on the way to storage so the
  // stored URL is the embeddable one (lessonEmbeds.js).
  url: z.string().refine((value) => normalizeEmbed(value) !== null, {
    message: `Embeds are allowed from: ${EMBED_ALLOWLIST.join(', ')}`,
  }),
  caption: z.string().max(500).optional(),
})

// VIDEO and FILE point at content the course already holds. That the id
// exists *and belongs to this course* is checked in lesson.service, where
// the course is known — a reference is what decides who may watch a video,
// so pointing at another course's row would be a way around its access
// rules.
const videoBlock = z.object({
  id: objectId.optional(),
  type: z.literal('VIDEO'),
  videoId: objectId,
  caption: z.string().max(500).optional(),
})

const fileBlock = z.object({
  id: objectId.optional(),
  type: z.literal('FILE'),
  materialId: objectId,
  caption: z.string().max(500).optional(),
})

const tableBlock = z.object({
  id: objectId.optional(),
  type: z.literal('TABLE'),
  // Cells are plain text. Ragged rows are padded on the way in rather than
  // refused — an author adding a column leaves the rows below it short
  // until they type, and a table should not fail to save mid-edit.
  rows: z.array(z.array(z.string().max(2000)).min(1).max(12)).min(1).max(100),
  hasHeader: z.boolean().optional(),
  caption: z.string().max(500).optional(),
})

const dividerBlock = z.object({
  id: objectId.optional(),
  type: z.literal('DIVIDER'),
})

const lessonBlock = z.discriminatedUnion('type', [
  headingBlock,
  textBlock,
  quoteBlock,
  calloutBlock,
  codeBlock,
  imageBlock,
  galleryBlock,
  embedBlock,
  videoBlock,
  fileBlock,
  tableBlock,
  dividerBlock,
])

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
