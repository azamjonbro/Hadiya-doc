import { Schema, model } from 'mongoose'

const topicSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: '' },
    cover: { type: String, default: '' },
    banner: { type: String, default: '' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    duration: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

topicSchema.index({ courseId: 1, order: 1 })
topicSchema.index({ courseId: 1, slug: 1 }, { unique: true })

export const Topic = model('Topic', topicSchema)
