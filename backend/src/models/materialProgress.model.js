import { Schema, model } from 'mongoose'

/**
 * How far through a document an employee has actually got.
 *
 * Pages are stored as the set of page numbers seen, not a high-water mark: a
 * reader who jumps to slide 40 has read one slide, not forty, and a course
 * percentage built on "furthest page reached" would reward skipping to the
 * end. `viewedPages` is deduplicated on write, so re-reading a page changes
 * nothing.
 *
 * `totalPages` is reported by the viewer when it opens the file, because only
 * the client knows it — the server never parses the pptx or pdf. It is stored
 * rather than trusted per request so a later report with a wrong count cannot
 * quietly rescale the percentage.
 */
const materialProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    totalPages: { type: Number, default: 0 },
    viewedPages: { type: [Number], default: [] },
    completionPercent: { type: Number, default: 0 },
    firstViewedAt: { type: Date, default: null },
    lastViewedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

materialProgressSchema.index({ userId: 1, materialId: 1 }, { unique: true })
materialProgressSchema.index({ courseId: 1, userId: 1 })

export const MaterialProgress = model('MaterialProgress', materialProgressSchema)
