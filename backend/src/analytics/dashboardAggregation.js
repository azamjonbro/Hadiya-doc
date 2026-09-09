import { User } from '../models/user.model.js'
import { Course } from '../models/course.model.js'
import { CourseAssignment } from '../models/courseAssignment.model.js'
import { VideoProgress } from '../models/videoProgress.model.js'
import { VideoSession } from '../models/videoSession.model.js'
import { News } from '../models/news.model.js'
import { NewsView } from '../models/newsView.model.js'
import { Task } from '../models/task.model.js'
import { Session } from '../models/session.model.js'

const WATCH_TIME_TREND_DAYS = 14
const TOP_N = 10

// One aggregation per named list, grouped by videoId with the video's
// title/courseId joined in — reused by the "most skipped" / "most paused"
// charts, which differ only in which field they sort/average on.
function videoStatChart(sortField) {
  return VideoProgress.aggregate([
    { $group: { _id: '$videoId', avgValue: { $avg: `$${sortField}` }, viewers: { $sum: 1 } } },
    { $sort: { avgValue: -1 } },
    { $limit: TOP_N },
    {
      $lookup: { from: 'videos', localField: '_id', foreignField: '_id', as: 'video' },
    },
    { $unwind: '$video' },
    {
      $project: {
        _id: 0,
        videoId: '$_id',
        title: '$video.title',
        courseId: '$video.courseId',
        value: { $round: ['$avgValue', 1] },
        viewers: 1,
      },
    },
  ])
}

async function courseCompletionStats() {
  const rows = await VideoProgress.aggregate([
    { $group: { _id: '$courseId', avgCompletion: { $avg: '$completionPercent' }, learners: { $sum: 1 } } },
    {
      $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' },
    },
    { $unwind: '$course' },
    {
      $project: {
        _id: 0,
        courseId: '$_id',
        title: '$course.title',
        avgCompletion: { $round: ['$avgCompletion', 1] },
        learners: 1,
      },
    },
  ])
  // Sorted once, both directions sliced from the same data — avoids running
  // the same $group twice for "course completion" vs "most difficult".
  const byCompletionDesc = [...rows].sort((a, b) => b.avgCompletion - a.avgCompletion)
  const byCompletionAsc = [...rows].sort((a, b) => a.avgCompletion - b.avgCompletion)
  return {
    courseCompletion: byCompletionDesc.slice(0, TOP_N),
    mostDifficultCourses: byCompletionAsc.slice(0, TOP_N),
  }
}

async function employeeEngagementStats() {
  const rows = await VideoProgress.aggregate([
    {
      $group: {
        _id: '$userId',
        totalWatchedSeconds: { $sum: '$uniqueWatchedSeconds' },
        avgCompletion: { $avg: '$completionPercent' },
      },
    },
    {
      $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' },
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        fullName: '$user.fullName',
        department: '$user.department',
        totalWatchedSeconds: 1,
        avgCompletion: { $round: ['$avgCompletion', 1] },
      },
    },
  ])
  const byWatchTimeDesc = [...rows].sort((a, b) => b.totalWatchedSeconds - a.totalWatchedSeconds)
  const byWatchTimeAsc = [...rows].sort((a, b) => a.totalWatchedSeconds - b.totalWatchedSeconds)

  // A histogram of every employee's average completion, not just the
  // VideoProgress-having ones — an employee with zero progress docs still
  // counts in the 0-25% bucket, since "hasn't started anything" is itself
  // a meaningful signal for this chart.
  //
  // Counted in the database rather than by pulling every user id into Node:
  // the $lookup collapses each employee's progress rows to a single average
  // before they leave the server, so this costs four counters no matter how
  // many people work here.
  const bucketRows = await User.aggregate([
    {
      $lookup: {
        from: 'videoprogresses',
        localField: '_id',
        foreignField: 'userId',
        pipeline: [{ $group: { _id: null, avgCompletion: { $avg: '$completionPercent' } } }],
        as: 'progress',
      },
    },
    // Rounded to one decimal first, the same way the rows above are, so a
    // 24.97% employee lands in the same bucket the chart's own numbers imply.
    { $set: { pct: { $round: [{ $ifNull: [{ $first: '$progress.avgCompletion' }, 0] }, 1] } } },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $lt: ['$pct', 25] }, then: '0-25' },
              { case: { $lt: ['$pct', 50] }, then: '25-50' },
              { case: { $lt: ['$pct', 75] }, then: '50-75' },
            ],
            default: '75-100',
          },
        },
        count: { $sum: 1 },
      },
    },
  ])
  const buckets = { '0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 }
  for (const row of bucketRows) buckets[row._id] = row.count

  return {
    mostEngagedEmployees: byWatchTimeDesc.slice(0, TOP_N),
    lowestEngagement: byWatchTimeAsc.slice(0, TOP_N),
    employeeProgress: Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })),
  }
}

async function watchTimeByDay() {
  const since = new Date(Date.now() - WATCH_TIME_TREND_DAYS * 24 * 60 * 60 * 1000)
  const rows = await VideoSession.aggregate([
    { $match: { startedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
        totalSeconds: { $sum: '$watchedDuration' },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', totalSeconds: 1 } },
  ])

  // Zero-fill days with no sessions so the chart is a continuous 14-day
  // series rather than only the days that happen to have data.
  const byDate = new Map(rows.map((r) => [r.date, r.totalSeconds]))
  const series = []
  for (let i = WATCH_TIME_TREND_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    series.push({ date: key, totalSeconds: byDate.get(key) ?? 0 })
  }
  return series
}

async function newsEngagementChart() {
  return NewsView.aggregate([
    { $group: { _id: '$newsId', avgReadPercent: { $avg: '$maxScrollDepth' }, opens: { $sum: '$openCount' } } },
    { $sort: { avgReadPercent: -1 } },
    { $limit: TOP_N },
    { $lookup: { from: 'news', localField: '_id', foreignField: '_id', as: 'news' } },
    { $unwind: '$news' },
    {
      $project: {
        _id: 0,
        newsId: '$_id',
        title: '$news.title',
        avgReadPercent: { $round: ['$avgReadPercent', 1] },
        opens: 1,
      },
    },
  ])
}

async function taskCompletionChart() {
  const rows = await Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
  const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.count]))
  return ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => ({
    status,
    count: byStatus[status] ?? 0,
  }))
}

async function cards() {
  const now = new Date()

  const [
    totalEmployees,
    activeEmployees,
    totalCourses,
    mandatoryCourses,
    completedAssignments,
    overdueAssignments,
    completionAvg,
    watchTimeAvg,
    newsEngagementAvg,
    activeSessions,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    Course.countDocuments({ status: { $ne: 'ARCHIVED' }, deletedAt: null }),
    CourseAssignment.countDocuments({ status: 'ACTIVE', mandatory: true }),
    CourseAssignment.countDocuments({ status: 'COMPLETED' }),
    CourseAssignment.countDocuments({
      status: 'ACTIVE',
      deadline: { $lt: now },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }),
    VideoProgress.aggregate([{ $group: { _id: null, avg: { $avg: '$completionPercent' } } }]),
    VideoProgress.aggregate([{ $group: { _id: null, avg: { $avg: '$totalWatchedSeconds' } } }]),
    NewsView.aggregate([{ $group: { _id: null, avg: { $avg: '$maxScrollDepth' } } }]),
    Session.countDocuments({ revoked: false, expiresAt: { $gt: now } }),
  ])

  return {
    totalEmployees,
    activeEmployees,
    totalCourses,
    mandatoryCourses,
    completedAssignments,
    overdueAssignments,
    avgCompletionPercent: Math.round((completionAvg[0]?.avg ?? 0) * 10) / 10,
    avgWatchTimeSeconds: Math.round(watchTimeAvg[0]?.avg ?? 0),
    newsEngagementPercent: Math.round((newsEngagementAvg[0]?.avg ?? 0) * 10) / 10,
    activeSessions,
  }
}

// The full dashboard payload — every heavy aggregation this needs, run
// concurrently. Called only by the scheduled job (see dashboardAggregationQueue.js),
// never synchronously from a request handler (spec §38).
export async function computeDashboard() {
  const [cardsResult, courseStats, employeeStats, mostSkippedVideos, mostPausedVideos, watchTimeTrend, newsEngagement, taskCompletion] =
    await Promise.all([
      cards(),
      courseCompletionStats(),
      employeeEngagementStats(),
      videoStatChart('forwardSeekSeconds'),
      videoStatChart('pausesCount'),
      watchTimeByDay(),
      newsEngagementChart(),
      taskCompletionChart(),
    ])

  return {
    cards: cardsResult,
    charts: {
      courseCompletion: courseStats.courseCompletion,
      mostDifficultCourses: courseStats.mostDifficultCourses,
      employeeProgress: employeeStats.employeeProgress,
      mostEngagedEmployees: employeeStats.mostEngagedEmployees,
      lowestEngagement: employeeStats.lowestEngagement,
      watchTimeByDay: watchTimeTrend,
      mostSkippedVideos,
      mostPausedVideos,
      newsEngagement,
      taskCompletion,
    },
    generatedAt: new Date().toISOString(),
  }
}
