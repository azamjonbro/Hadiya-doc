import { Schema, model } from 'mongoose'

/**
 * A comment under a news article (portal §3, the 💬 count). Flat — an
 * announcement gathers congratulations and questions, not a thread —
 * and plain text like kbComment, so there is no second HTML path to
 * sanitise. Soft-deleted so the count and the author's own history stay
 * consistent with what people saw.
 */
const newsCommentSchema = new Schema(
  {
    newsId: { type: Schema.Types.ObjectId, ref: 'News', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

newsCommentSchema.index({ newsId: 1, createdAt: 1 })

export const NewsComment = model('NewsComment', newsCommentSchema)
