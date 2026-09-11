import { NewsView } from '../models/newsView.model.js'

export const newsViewRepository = {
  findByUserAndNews(userId, newsId) {
    return NewsView.findOne({ userId, newsId })
  },

  // How many people opened each article — the number under a feed item.
  // One aggregation for the page, keyed by article id as a string.
  async countByNews(newsIds) {
    if (!newsIds.length) return {}
    const rows = await NewsView.aggregate([
      { $match: { newsId: { $in: newsIds }, openCount: { $gt: 0 } } },
      { $group: { _id: '$newsId', count: { $sum: 1 } } },
    ])
    return Object.fromEntries(rows.map((row) => [String(row._id), row.count]))
  },

  upsert(userId, newsId, data) {
    return NewsView.findOneAndUpdate(
      { userId, newsId },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  },
}
