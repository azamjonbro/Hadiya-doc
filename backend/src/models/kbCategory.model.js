import { Schema, model } from 'mongoose'

/**
 * A section of the knowledge base.
 *
 * Its own collection for the same reason course categories are: a free-text
 * field on the article means "HR" and "HR " are two sections that look
 * identical in the sidebar, and renaming one is a scan across every article.
 */
const kbCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    parentId: { type: Schema.Types.ObjectId, ref: 'KbCategory', default: null },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

kbCategorySchema.index({ parentId: 1, order: 1 })

export const KbCategory = model('KbCategory', kbCategorySchema)
