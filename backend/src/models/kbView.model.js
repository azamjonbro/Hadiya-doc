import { Schema, model } from 'mongoose'

/**
 * One person opening one article.
 *
 * Rows rather than a counter alone, because the useful questions are "which
 * articles does nobody read" and "did the new starters read the safety
 * procedure", and a bare number answers neither. The same shape as
 * `newsView`, deliberately — the analytics that read it are the same.
 */
const kbViewSchema = new Schema(
  {
    articleId: { type: Schema.Types.ObjectId, ref: 'KbArticle', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Whether the reader said it helped. Null means they did not say.
    helpful: { type: Boolean, default: null },
    viewedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

// One row per person per article: reopening it is the same person reading
// it again, not a second reader.
kbViewSchema.index({ articleId: 1, userId: 1 }, { unique: true })
kbViewSchema.index({ userId: 1, viewedAt: -1 })

export const KbView = model('KbView', kbViewSchema)
