import { VideoSession } from '../models/videoSession.model.js'

export const videoSessionRepository = {
  findBySessionId(sessionId) {
    return VideoSession.findOne({ sessionId })
  },

  async upsert(sessionId, data) {
    return VideoSession.findOneAndUpdate(
      { sessionId },
      { $set: data, $setOnInsert: { sessionId } },
      { upsert: true, new: true }
    )
  },

  countByUserAndVideo(userId, videoId) {
    return VideoSession.countDocuments({ userId, videoId })
  },

  listByUserAndVideo(userId, videoId) {
    return VideoSession.find({ userId, videoId }).sort({ startedAt: -1 })
  },
}
