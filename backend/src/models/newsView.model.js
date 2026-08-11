import { Schema, model } from 'mongoose'

const milestoneSchema = new Schema(
  {
    depth: { type: Number, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
)

const newsViewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    newsId: { type: Schema.Types.ObjectId, ref: 'News', required: true },
    firstOpenedAt: { type: Date, default: null },
    lastOpenedAt: { type: Date, default: null },
    openCount: { type: Number, default: 0 },
    maxScrollDepth: { type: Number, default: 0 },
    milestones: { type: [milestoneSchema], default: [] },
    timeSpentSeconds: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

newsViewSchema.index({ userId: 1, newsId: 1 }, { unique: true })

export const NewsView = model('NewsView', newsViewSchema)
