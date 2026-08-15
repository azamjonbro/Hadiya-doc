import mongoose from 'mongoose'
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

  // Distinct calendar days (server-local, "YYYY-MM-DD") the user had any
  // watch session — the raw material for a day-streak count, not a stored
  // streak field, so it can never drift from actual activity.
  async listActiveDayKeys(userId) {
    const rows = await VideoSession.aggregate([
      // Cast by hand — aggregation skips Mongoose's query casting, so a raw
      // userId string would match no sessions and flatten the streak to 0.
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } } } },
    ])
    return rows.map((r) => r._id)
  },

  // Per-calendar-day watch totals for one user, the raw series behind the
  // employee activity view ("which day did they work most/least"). Days with
  // no session are simply absent — the caller zero-fills the gaps.
  // Same manual ObjectId cast as listActiveDayKeys, and the same UTC day
  // boundaries, so both agree on what counts as "a day".
  async aggregateDailyActivity(userId, since) {
    const rows = await VideoSession.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), startedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
          watchedSeconds: { $sum: '$watchedDuration' },
          activeSeconds: { $sum: '$activeDuration' },
          sessions: { $sum: 1 },
          videoIds: { $addToSet: '$videoId' },
        },
      },
      { $sort: { _id: 1 } },
    ])
    return rows.map((row) => ({
      date: row._id,
      watchedSeconds: Math.round(row.watchedSeconds),
      activeSeconds: Math.round(row.activeSeconds),
      sessions: row.sessions,
      videos: row.videoIds.length,
    }))
  },
}
