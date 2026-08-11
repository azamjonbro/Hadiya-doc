import { VideoProgress } from '../models/videoProgress.model.js'

export const videoProgressRepository = {
  findByUserAndVideo(userId, videoId) {
    return VideoProgress.findOne({ userId, videoId })
  },

  async upsert(userId, videoId, courseId, data) {
    return VideoProgress.findOneAndUpdate(
      { userId, videoId },
      { $set: { ...data, courseId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  },

  listByUser(userId) {
    return VideoProgress.find({ userId })
  },

  listByVideo(videoId) {
    return VideoProgress.find({ videoId })
  },
}
