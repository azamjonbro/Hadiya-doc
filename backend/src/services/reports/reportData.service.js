import { User } from '../../models/user.model.js'
import { Course } from '../../models/course.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { VideoProgress } from '../../models/videoProgress.model.js'
import { News } from '../../models/news.model.js'
import { NewsView } from '../../models/newsView.model.js'
import { Task } from '../../models/task.model.js'
import { ApiError } from '../../utils/ApiError.js'

// Hard cap on exported rows — an admin exporting the whole org is a
// legitimate, expected use, but an unbounded export is still a resource-
// exhaustion vector on a shared server.
const MAX_ROWS = 5000

function round1(n) {
  return Math.round((n ?? 0) * 10) / 10
}

async function employeeProgress() {
  const columns = [
    { key: 'fullName', header: 'Full name' },
    { key: 'username', header: 'Username' },
    { key: 'department', header: 'Department' },
    { key: 'isActive', header: 'Active' },
    { key: 'assignedCourses', header: 'Assigned courses' },
    { key: 'completedCourses', header: 'Completed courses' },
    { key: 'overdueCourses', header: 'Overdue courses' },
    { key: 'avgCompletionPercent', header: 'Avg completion %' },
    { key: 'totalWatchedMinutes', header: 'Total watched (min)' },
  ]

  const now = new Date()
  const users = await User.find({}, { fullName: 1, username: 1, department: 1, isActive: 1 })
    .sort({ fullName: 1 })
    .limit(MAX_ROWS)
  const userIds = users.map((u) => u._id)

  const [assignmentStats, progressStats] = await Promise.all([
    CourseAssignment.aggregate([
      { $match: { userId: { $in: userIds } } },
      {
        $group: {
          _id: '$userId',
          assignedCourses: { $sum: 1 },
          completedCourses: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          overdueCourses: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'ACTIVE'] },
                    { $ne: ['$deadline', null] },
                    { $lt: ['$deadline', now] },
                    { $or: [{ $eq: ['$expiresAt', null] }, { $gt: ['$expiresAt', now] }] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    VideoProgress.aggregate([
      { $match: { userId: { $in: userIds } } },
      {
        $group: {
          _id: '$userId',
          avgCompletionPercent: { $avg: '$completionPercent' },
          totalWatchedSeconds: { $sum: '$uniqueWatchedSeconds' },
        },
      },
    ]),
  ])

  const byUserAssignment = new Map(assignmentStats.map((r) => [r._id.toString(), r]))
  const byUserProgress = new Map(progressStats.map((r) => [r._id.toString(), r]))

  const rows = users.map((u) => {
    const a = byUserAssignment.get(u._id.toString()) ?? { assignedCourses: 0, completedCourses: 0, overdueCourses: 0 }
    const p = byUserProgress.get(u._id.toString()) ?? { avgCompletionPercent: 0, totalWatchedSeconds: 0 }
    return {
      fullName: u.fullName,
      username: u.username,
      department: u.department,
      isActive: u.isActive ? 'Yes' : 'No',
      assignedCourses: a.assignedCourses,
      completedCourses: a.completedCourses,
      overdueCourses: a.overdueCourses,
      avgCompletionPercent: round1(p.avgCompletionPercent),
      totalWatchedMinutes: Math.round((p.totalWatchedSeconds ?? 0) / 60),
    }
  })

  return { columns, rows }
}

async function courseProgress() {
  const columns = [
    { key: 'title', header: 'Course' },
    { key: 'status', header: 'Status' },
    { key: 'assignedCount', header: 'Assigned' },
    { key: 'completedCount', header: 'Completed' },
    { key: 'avgCompletionPercent', header: 'Avg completion %' },
  ]

  const courses = await Course.find({}, { title: 1, status: 1 }).sort({ title: 1 }).limit(MAX_ROWS)
  const courseIds = courses.map((c) => c._id)

  const [assignmentStats, progressStats] = await Promise.all([
    CourseAssignment.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      {
        $group: {
          _id: '$courseId',
          assignedCount: { $sum: 1 },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
        },
      },
    ]),
    VideoProgress.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', avgCompletionPercent: { $avg: '$completionPercent' } } },
    ]),
  ])

  const byCourseAssignment = new Map(assignmentStats.map((r) => [r._id.toString(), r]))
  const byCourseProgress = new Map(progressStats.map((r) => [r._id.toString(), r]))

  const rows = courses.map((c) => {
    const a = byCourseAssignment.get(c._id.toString()) ?? { assignedCount: 0, completedCount: 0 }
    const p = byCourseProgress.get(c._id.toString()) ?? { avgCompletionPercent: 0 }
    return {
      title: c.title,
      status: c.status,
      assignedCount: a.assignedCount,
      completedCount: a.completedCount,
      avgCompletionPercent: round1(p.avgCompletionPercent),
    }
  })

  return { columns, rows }
}

async function videoAnalytics() {
  const columns = [
    { key: 'title', header: 'Video' },
    { key: 'viewers', header: 'Viewers' },
    { key: 'avgCompletionPercent', header: 'Avg completion %' },
    { key: 'avgPausesCount', header: 'Avg pauses' },
    { key: 'avgForwardSeekSeconds', header: 'Avg skipped (sec)' },
  ]

  const rows = await VideoProgress.aggregate([
    {
      $group: {
        _id: '$videoId',
        viewers: { $sum: 1 },
        avgCompletionPercent: { $avg: '$completionPercent' },
        avgPausesCount: { $avg: '$pausesCount' },
        avgForwardSeekSeconds: { $avg: '$forwardSeekSeconds' },
      },
    },
    { $lookup: { from: 'videos', localField: '_id', foreignField: '_id', as: 'video' } },
    { $unwind: '$video' },
    { $sort: { viewers: -1 } },
    { $limit: MAX_ROWS },
    {
      $project: {
        _id: 0,
        title: '$video.title',
        viewers: 1,
        avgCompletionPercent: { $round: ['$avgCompletionPercent', 1] },
        avgPausesCount: { $round: ['$avgPausesCount', 1] },
        avgForwardSeekSeconds: { $round: ['$avgForwardSeekSeconds', 1] },
      },
    },
  ])

  return { columns, rows }
}

async function newsAnalytics() {
  const columns = [
    { key: 'title', header: 'Article' },
    { key: 'publishAt', header: 'Published' },
    { key: 'opens', header: 'Opens' },
    { key: 'avgReadPercent', header: 'Avg read %' },
    { key: 'avgTimeSpentSeconds', header: 'Avg time spent (sec)' },
  ]

  const articles = await News.find({}, { title: 1, publishAt: 1 }).sort({ publishAt: -1 }).limit(MAX_ROWS)
  const newsIds = articles.map((n) => n._id)

  const viewStats = await NewsView.aggregate([
    { $match: { newsId: { $in: newsIds } } },
    {
      $group: {
        _id: '$newsId',
        opens: { $sum: '$openCount' },
        avgReadPercent: { $avg: '$maxScrollDepth' },
        avgTimeSpentSeconds: { $avg: '$timeSpentSeconds' },
      },
    },
  ])
  const byNews = new Map(viewStats.map((r) => [r._id.toString(), r]))

  const rows = articles.map((n) => {
    const s = byNews.get(n._id.toString()) ?? { opens: 0, avgReadPercent: 0, avgTimeSpentSeconds: 0 }
    return {
      title: n.title,
      publishAt: n.publishAt.toISOString().slice(0, 10),
      opens: s.opens,
      avgReadPercent: round1(s.avgReadPercent),
      avgTimeSpentSeconds: Math.round(s.avgTimeSpentSeconds ?? 0),
    }
  })

  return { columns, rows }
}

async function taskAnalytics() {
  const columns = [
    { key: 'title', header: 'Task' },
    { key: 'assignedTo', header: 'Assigned to' },
    { key: 'assignedBy', header: 'Assigned by' },
    { key: 'priority', header: 'Priority' },
    { key: 'status', header: 'Status' },
    { key: 'deadline', header: 'Deadline' },
    { key: 'completedAt', header: 'Completed at' },
  ]

  const rows = await Task.aggregate([
    { $sort: { createdAt: -1 } },
    { $limit: MAX_ROWS },
    { $lookup: { from: 'users', localField: 'assignedTo', foreignField: '_id', as: 'assignee' } },
    { $lookup: { from: 'users', localField: 'assignedBy', foreignField: '_id', as: 'assigner' } },
    { $unwind: { path: '$assignee', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$assigner', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        title: 1,
        assignedTo: '$assignee.fullName',
        assignedBy: '$assigner.fullName',
        priority: 1,
        status: 1,
        deadline: 1,
        completedAt: 1,
      },
    },
  ])

  return {
    columns,
    rows: rows.map((r) => ({
      ...r,
      deadline: r.deadline ? new Date(r.deadline).toISOString().slice(0, 10) : '',
      completedAt: r.completedAt ? new Date(r.completedAt).toISOString().slice(0, 10) : '',
    })),
  }
}

const REPORT_BUILDERS = {
  'employee-progress': employeeProgress,
  'course-progress': courseProgress,
  'video-analytics': videoAnalytics,
  'news-analytics': newsAnalytics,
  'task-analytics': taskAnalytics,
}

export const REPORT_TYPES = Object.keys(REPORT_BUILDERS)

export const reportDataService = {
  async build(type) {
    const builder = REPORT_BUILDERS[type]
    if (!builder) throw ApiError.badRequest('Unknown report type', 'UNKNOWN_REPORT_TYPE')
    return builder()
  },
}
