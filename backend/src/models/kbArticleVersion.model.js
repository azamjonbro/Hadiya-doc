import { Schema, model } from 'mongoose'

/**
 * A snapshot of an article as it was.
 *
 * A knowledge base is read as instruction — "this is how we do it" — so
 * being able to answer "what did this say in March, when the incident
 * happened" is the point. Storing the whole body rather than a diff keeps
 * that answer readable without reconstructing anything.
 */
const kbArticleVersionSchema = new Schema(
  {
    articleId: { type: Schema.Types.ObjectId, ref: 'KbArticle', required: true },
    version: { type: Number, required: true },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    body: { type: String, default: '' },
    // Why it changed, when the editor bothered to say. Optional, because
    // forcing a message produces "update" on every row.
    changeNote: { type: String, default: '' },
    editedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

kbArticleVersionSchema.index({ articleId: 1, version: -1 }, { unique: true })

export const KbArticleVersion = model('KbArticleVersion', kbArticleVersionSchema)
