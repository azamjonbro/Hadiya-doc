import { Schema, model } from 'mongoose'

/**
 * A question or correction on an article.
 *
 * Comments on a procedure are usually "this step is out of date", which is
 * the most valuable feedback a knowledge base gets — so they are attached
 * to the article rather than sent to somebody's inbox where they die.
 *
 * The body is plain text, not HTML: a comment needs no formatting, and
 * accepting markup here would mean sanitising a second, less controlled
 * input path.
 */
const kbCommentSchema = new Schema(
  {
    articleId: { type: Schema.Types.ObjectId, ref: 'KbArticle', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    // A reply to another comment. One level deep; a threaded tree on a
    // procedure page is more structure than the conversation needs.
    parentId: { type: Schema.Types.ObjectId, ref: 'KbComment', default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

kbCommentSchema.index({ articleId: 1, createdAt: 1 })

export const KbComment = model('KbComment', kbCommentSchema)
