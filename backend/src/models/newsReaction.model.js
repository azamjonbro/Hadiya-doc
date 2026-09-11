import { Schema, model } from 'mongoose'

/**
 * One row per person who liked an article (portal §3, the ♡ under a feed
 * item). A row, not a counter on the article: the count is derived, so a
 * double click, a retry or a deleted account can never leave it wrong,
 * and "did I like this" is a lookup rather than a client-side guess.
 */
const newsReactionSchema = new Schema(
  {
    newsId: { type: Schema.Types.ObjectId, ref: 'News', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

newsReactionSchema.index({ newsId: 1, userId: 1 }, { unique: true })

export const NewsReaction = model('NewsReaction', newsReactionSchema)
