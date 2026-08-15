import mongoose from 'mongoose'
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

  listByUserAndCourse(userId, courseId) {
    return VideoProgress.find({ userId, courseId })
  },

  listByVideo(videoId) {
    return VideoProgress.find({ videoId })
  },

  // One-way latch for the manager alert — set before the notification is sent
  // so a partial failure costs one message rather than repeating it on every
  // subsequent event batch.
  markInattentionReported(userId, videoId) {
    return VideoProgress.updateOne({ userId, videoId }, { $set: { inattentionReportedAt: new Date() } })
  },

  async getLearningSummary(userId) {
    // Aggregation pipelines bypass Mongoose's query casting, so the userId
    // string has to be cast by hand — otherwise $match finds nothing and
    // every learning stat reads back as zero.
    const rows = await VideoProgress.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalWatchedSeconds: { $sum: '$totalWatchedSeconds' },
          videosWatched: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } },
        },
      },
    ])
    return rows[0] ?? { totalWatchedSeconds: 0, videosWatched: 0 }
  },
}
