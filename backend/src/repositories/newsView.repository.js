import { NewsView } from '../models/newsView.model.js'

export const newsViewRepository = {
  findByUserAndNews(userId, newsId) {
    return NewsView.findOne({ userId, newsId })
  },

  upsert(userId, newsId, data) {
    return NewsView.findOneAndUpdate(
      { userId, newsId },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  },
}
