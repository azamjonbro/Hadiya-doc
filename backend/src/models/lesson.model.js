import { Schema, model } from 'mongoose'
import { CONTENT_KINDS, registerContentModel } from '../services/courses/contentItem.js'

/**
 * A text lesson: the one kind of content a topic could not hold (9.1).
 *
 * Everything else in a topic is a file that was uploaded — a video, a
 * document, a test. A procedure written as a few headings and paragraphs had
 * nowhere to go, so authors wrote it in Word and uploaded the .docx, which
 * makes a searchable, translatable, phone-readable page into an attachment.
 *
 * The lesson is also the first content type to join the shared contract in
 * contentItem.js rather than repeating it: draft visibility, its place in
 * the topic sequence, and how that sequence is rewritten all come from
 * there. That is what "polymorphic base" means here — one contract, four
 * collections that keep their own shapes.
 */

/**
 * The twelve block types a lesson can hold (9.2).
 *
 * Chosen so that each one is a thing the editor and the reader can actually
 * do something with, rather than a label:
 *
 *   HEADING TEXT QUOTE CALLOUT CODE   — written matter
 *   IMAGE GALLERY EMBED               — media the lesson carries itself
 *   VIDEO FILE                        — a reference to content the course
 *                                       already holds, not a second copy
 *   TABLE DIVIDER                     — structure
 *
 * What is *not* here is deliberate. A LINK block would be a TEXT block with
 * one link in it. An in-page quiz would be a fifth content type wearing a
 * block's clothes — it needs attempts, grading and a pass mark, all of
 * which the assessment already has (4.2), so a lesson references a test
 * rather than containing one.
 */
export const LESSON_BLOCK_TYPES = [
  'HEADING',
  'TEXT',
  'QUOTE',
  'CALLOUT',
  'CODE',
  'IMAGE',
  'GALLERY',
  'EMBED',
  'VIDEO',
  'FILE',
  'TABLE',
  'DIVIDER',
]

/** What a CALLOUT is for — it decides the colour and the icon, nothing else. */
export const CALLOUT_VARIANTS = ['INFO', 'WARNING', 'SUCCESS', 'DANGER']

/**
 * Named fields rather than a `data: Mixed` bag.
 *
 * Mixed means "anything", which means nothing is validated and a typo in the
 * editor is stored as happily as a correct block. The fields overlap
 * between types (a caption belongs to an image, a level to a heading) and
 * unused ones stay at their defaults — cheaper than the alternative, where
 * every read has to guess what shape it got.
 *
 * `_id` is kept on purpose: it is what reading progress records, so an
 * author reordering blocks does not reset anybody's place.
 */
// One image inside a GALLERY. Its own schema so a gallery entry has the
// same three fields an IMAGE block does, and `_id: false` because nothing
// records progress against a single photograph.
const galleryItemSchema = new Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, default: '' },
    caption: { type: String, default: '' },
  },
  { _id: false }
)

const blockSchema = new Schema(
  {
    type: { type: String, enum: LESSON_BLOCK_TYPES, required: true },
    // HEADING, CODE, QUOTE: plain text. TEXT, CALLOUT: sanitised HTML
    // (see lessonBlocks.js).
    text: { type: String, default: '' },
    // HEADING only. h1 is the lesson title, so a block starts at h2.
    level: { type: Number, min: 2, max: 4, default: 2 },
    // IMAGE: a URL from POST /uploads/image. EMBED: the normalised iframe
    // URL — never the address the author pasted (lessonEmbeds.js).
    url: { type: String, default: '' },
    alt: { type: String, default: '' },
    caption: { type: String, default: '' },
    items: { type: [galleryItemSchema], default: undefined },
    // VIDEO / FILE: content the course already holds. A reference rather
    // than a copy, so a video used in a lesson is the same row the
    // curriculum lists, with the same processing state and the same
    // playback rules — and re-uploading it to embed it would be absurd.
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', default: null },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', default: null },
    // QUOTE: who said it.
    author: { type: String, default: '' },
    // CALLOUT: which kind of aside this is.
    variant: { type: String, enum: CALLOUT_VARIANTS, default: 'INFO' },
    // TABLE: rows of plain-text cells, and whether the first row is the
    // header. Cells are text, not HTML — a table of formatted fragments is
    // where a block editor turns into a word processor.
    rows: { type: [[String]], default: undefined },
    hasHeader: { type: Boolean, default: true },
    // CODE: the language label, for the reader's highlighter.
    language: { type: String, default: '' },
    // EMBED: which allowlisted service the URL resolved to. Stored so the
    // reader can label the frame without re-parsing the URL.
    provider: { type: String, default: '' },
  },
  { _id: true }
)

const lessonSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    blocks: { type: [blockSchema], default: [] },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    // Same flag videos carry, read by the same completion rule: a lesson
    // that is required has to be finished before the course is.
    required: { type: Boolean, default: true },
    // Author-stated reading time. Not computed from the word count: a
    // hundred words of safety rules take longer than a hundred of welcome.
    estimatedMinutes: { type: Number, min: 0, default: 0 },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

lessonSchema.index({ topicId: 1, order: 1 })
lessonSchema.index({ courseId: 1 })

export const Lesson = model('Lesson', lessonSchema)

// Registered here rather than in lesson.service.js so that any code path
// that can touch the collection has registered it. In the service it would
// depend on which service happened to be imported first: a material created
// in a request that never loaded lesson.service would take an `order`
// counted across three collections instead of four, and land on top of a
// lesson.
registerContentModel(CONTENT_KINDS.LESSON, Lesson)
