import mongoose from 'mongoose'
import { NewsReaction } from '../models/newsReaction.model.js'
import { NewsComment } from '../models/newsComment.model.js'

// Aggregation does not cast the way find() does: a string id in $in
// matches nothing, silently. Every id goes through here first.
const asObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)))

async function countBy(Model, newsIds, extra = {}) {
  if (!newsIds.length) return {}
  const rows = await Model.aggregate([
    { $match: { newsId: { $in: newsIds.map(asObjectId) }, ...extra } },
    { $group: { _id: '$newsId', count: { $sum: 1 } } },
  ])
  return Object.fromEntries(rows.map((row) => [String(row._id), row.count]))
}

export const newsEngagementRepository = {
  // Likes, comments and "did I like it" for a page of articles, keyed by
  // article id — three queries for the feed, not three per row.
  async summarize(newsIds, userId) {
    const [likes, comments, mine] = await Promise.all([
      countBy(NewsReaction, newsIds),
      countBy(NewsComment, newsIds, { deletedAt: null }),
      newsIds.length && userId ? NewsReaction.find({ newsId: { $in: newsIds }, userId }).select('newsId').lean() : [],
    ])
    const liked = new Set(mine.map((row) => String(row.newsId)))
    return Object.fromEntries(
      newsIds.map((id) => {
        const key = String(id)
        return [key, { likes: likes[key] ?? 0, comments: comments[key] ?? 0, liked: liked.has(key) }]
      })
    )
  },

  // Toggle. The unique index makes a concurrent double tap collapse to one
  // row; the duplicate-key error from the loser is treated as "already
  // liked", which is what the person meant.
  async toggleLike(newsId, userId) {
    const removed = await NewsReaction.findOneAndDelete({ newsId, userId })
    if (removed) return false
    try {
      await NewsReaction.create({ newsId, userId })
    } catch (error) {
      if (error.code !== 11000) throw error
    }
    return true
  },

  countLikes(newsId) {
    return NewsReaction.countDocuments({ newsId })
  },

  async listAllComments({ page = 1, limit = 25 }) {
    const filter = { deletedAt: null }
    const [rows, total] = await Promise.all([
      NewsComment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'fullName avatar')
        .lean(),
      NewsComment.countDocuments(filter),
    ])
    return { rows, total }
  },

  listComments(newsId) {
    return NewsComment.find({ newsId, deletedAt: null }).sort({ createdAt: 1 }).populate('userId', 'fullName avatar').lean()
  },

  createComment(data) {
    return NewsComment.create(data)
  },

  findComment(id) {
    return NewsComment.findOne({ _id: id, deletedAt: null })
  },

  softDeleteComment(id) {
    return NewsComment.updateOne({ _id: id }, { $set: { deletedAt: new Date() } })
  },
}
