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
 * The block types a lesson can hold today.
 *
 * Four, not the twelve the editor will offer (9.2): a block type the API
 * accepts is a block type it has to validate, sanitise and eventually
 * render, and shipping eight of those before anything can display them
 * would be storing content nobody can read. These four are enough for a
 * real written lesson to exist end to end, and the validator is a
 * discriminated union so each later type is an entry rather than a rewrite.
 */
export const LESSON_BLOCK_TYPES = ['HEADING', 'TEXT', 'IMAGE', 'DIVIDER']

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
const blockSchema = new Schema(
  {
    type: { type: String, enum: LESSON_BLOCK_TYPES, required: true },
    // HEADING: the heading text. TEXT: sanitised HTML (see lessonBlocks.js).
    text: { type: String, default: '' },
    // HEADING only. h1 is the lesson title, so a block starts at h2.
    level: { type: Number, min: 2, max: 4, default: 2 },
    // IMAGE: a URL from POST /uploads/image.
    url: { type: String, default: '' },
    alt: { type: String, default: '' },
    caption: { type: String, default: '' },
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
