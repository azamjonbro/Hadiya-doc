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

  // Dense rank of one person on the company board: how many distinct
  // totals sit above theirs, plus one. Null with no points — an unranked
  // person is not "last", they have not started.
  async rankOf(userId) {
    const { totalPoints } = await this.getSummary(userId)
    if (!totalPoints) return null
    const rows = await PointsLedger.aggregate([
      { $group: { _id: '$userId', totalPoints: { $sum: '$points' } } },
      { $match: { totalPoints: { $gt: totalPoints } } },
      { $group: { _id: '$totalPoints' } },
      { $count: 'n' },
    ])
    return (rows[0]?.n ?? 0) + 1
  },

  // The person's own ledger, newest first, with the course and the video or
  // test each entry came from — the "Ballar" tab on the profile (portal §10).
  listForUser(userId, limit = 100) {
    return PointsLedger.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('courseId', 'title')
      .populate('videoId', 'title')
      .populate('assessmentId', 'title')
      .lean()
  },

  /**
   * The leaderboard itself, ranked and cut inside the database.
   *
   * This used to be "sum the ledger for every candidate, hand a row per
   * employee back to Node, sort there" — which meant the whole company's
   * point totals crossed the wire so that twenty of them could be shown.
   * The sort and the limit now happen next to the data, and the employee
   * fields ride along from a $lookup on the grouped ids, so a request costs
   * one round trip and returns at most `limit` rows.
   *
   * The join also does the scoping: only active employees (optionally of one
   * department) survive the $unwind, so someone deactivated after earning
   * points drops off the board without a second query.
   *
   * `totalRanked` is counted in the same pass ($facet), because the caller
   * needs the size of the board, and re-running the group to count it would
   * undo the point of doing this at all.
   *
   * Same manual ObjectId cast as getSummary: aggregation skips Mongoose's
   * query casting, so string ids would match nothing.
   */
  async rankUsers({ memberIds, department, since, limit = 20 } = {}) {
    const match = {}
    if (memberIds) match.userId = { $in: memberIds.map((id) => new mongoose.Types.ObjectId(id)) }
    if (since) match.createdAt = { $gte: since }

    const userMatch = { isActive: true }
    if (department) userMatch.department = department

    const [result] = await PointsLedger.aggregate([
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
      { $match: { totalPoints: { $gt: 0 } } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
          pipeline: [
            { $match: userMatch },
            { $project: { fullName: 1, avatar: 1, department: 1, position: 1, jshshir: 1 } },
          ],
        },
      },
      { $unwind: '$user' },
      {
        $facet: {
          // Name breaks ties so the cut at `limit` is the same on every
          // request rather than however Mongo happened to order the group.
          rows: [{ $sort: { totalPoints: -1, 'user.fullName': 1 } }, { $limit: limit }],
          total: [{ $count: 'value' }],
        },
      },
    ])

    return {
      rows: (result?.rows ?? []).map(({ _id, user, ...totals }) => ({
        userId: _id.toString(),
        user,
        ...totals,
      })),
      totalRanked: result?.total?.[0]?.value ?? 0,
    }
  },
}
