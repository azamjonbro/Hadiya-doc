import mongoose from 'mongoose'
import { PointsLedger } from '../models/pointsLedger.model.js'

export const pointsLedgerRepository = {
  create(data) {
    return PointsLedger.create(data)
  },

  async getSummary(userId) {
    // Raw aggregation pipelines skip Mongoose's automatic query-filter
    // casting (unlike find()), so the userId string off the JWT must be cast
    // by hand or $match compares it against every document's ObjectId and
    // matches nothing — leaving every user's total stuck at zero.
    const rows = await PointsLedger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalPoints: { $sum: '$points' },
          videosCompleted: { $sum: { $cond: [{ $eq: ['$source', 'COMPLETION'] }, 1, 0] } },
          quizzesPassed: { $sum: { $cond: [{ $eq: ['$source', 'QUIZ'] }, 1, 0] } },
          assessmentsPassed: { $sum: { $cond: [{ $eq: ['$source', 'ASSESSMENT'] }, 1, 0] } },
        },
      },
      // Drop the grouping key so the populated shape matches the zero
      // fallback below — otherwise callers see a stray `_id: null` only when
      // the user happens to have points.
      { $project: { _id: 0 } },
    ])
    return rows[0] ?? { totalPoints: 0, videosCompleted: 0, quizzesPassed: 0, assessmentsPassed: 0 }
  },

  // Point totals per user, optionally narrowed to a set of users (a group,
  // a department) and to a time window. Ranking and the merge with
  // zero-point users happen in the service — this only sums the ledger.
  // Same manual ObjectId cast as getSummary: aggregation skips Mongoose's
  // query casting, so string ids would match nothing.
  async totalsForUsers({ userIds, since } = {}) {
    const match = {}
    if (userIds) match.userId = { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) }
    if (since) match.createdAt = { $gte: since }

    const rows = await PointsLedger.aggregate([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      {
        $group: {
          _id: '$userId',
          totalPoints: { $sum: '$points' },
          videosCompleted: { $sum: { $cond: [{ $eq: ['$source', 'COMPLETION'] }, 1, 0] } },
          quizzesPassed: { $sum: { $cond: [{ $eq: ['$source', 'QUIZ'] }, 1, 0] } },
          assessmentsPassed: { $sum: { $cond: [{ $eq: ['$source', 'ASSESSMENT'] }, 1, 0] } },
          lastEarnedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { totalPoints: -1 } },
    ])
    return rows.map(({ _id, ...totals }) => ({ userId: _id.toString(), ...totals }))
  },
}
