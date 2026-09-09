import { Schema, model } from 'mongoose'

/**
 * A category a course belongs to.
 *
 * Its own collection rather than a string on the course: a catalog of forty
 * courses is filtered by category constantly, and a free-text field means
 * "Mehnat muhofazasi" and "Mehnat muhofazasi " are two categories that look
 * identical in the filter list. Renaming one is then a scan-and-replace
 * across every course instead of one write here.
 *
 * Nesting is one level deep on purpose (`parentId` pointing at a top-level
 * category). A tree of arbitrary depth is a navigation problem nobody asked
 * for yet, and the field can carry deeper structure later without a
 * migration if it turns out they did.
 */
const courseCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '' },
    // Shown as the chip colour in the catalog. Stored rather than derived
    // from the name so a category keeps its colour when it is renamed.
    color: { type: String, default: '#6366f1' },
    parentId: { type: Schema.Types.ObjectId, ref: 'CourseCategory', default: null },
    // Manual ordering: categories are read in a fixed sequence that matches
    // how the training department thinks about them, not alphabetically.
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

courseCategorySchema.index({ parentId: 1, order: 1 })

export const CourseCategory = model('CourseCategory', courseCategorySchema)
