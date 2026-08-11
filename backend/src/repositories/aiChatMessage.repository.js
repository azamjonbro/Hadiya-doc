import { AiChatMessage } from '../models/aiChatMessage.model.js'

export const aiChatMessageRepository = {
  create(data) {
    return AiChatMessage.create(data)
  },

  // Most-recent-first for the client (chat UIs render newest-last, but
  // paginate backwards from "now"); reversed separately when building the
  // model's conversation context, which needs chronological order instead.
  async listPage({ userId, courseId, topicId, videoId, cursor, limit }) {
    const filter = { userId, courseId, topicId: topicId ?? null, videoId: videoId ?? null }
    if (cursor) filter._id = { $lt: cursor }
    return AiChatMessage.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },

  async listRecentForContext({ userId, courseId, topicId, videoId, limit }) {
    const rows = await AiChatMessage.find({ userId, courseId, topicId: topicId ?? null, videoId: videoId ?? null })
      .sort({ _id: -1 })
      .limit(limit)
    return rows.reverse()
  },
}
