import mongoose from 'mongoose'
import { User } from '../../models/user.model.js'
import { Course } from '../../models/course.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { VideoProgress } from '../../models/videoProgress.model.js'
import { News } from '../../models/news.model.js'
import { NewsView } from '../../models/newsView.model.js'
import { Task } from '../../models/task.model.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { DEFAULT_REPORT_LANG, reportTranslator } from './reportI18n.js'

// Hard cap on exported rows — an admin exporting the whole org is a
// legitimate, expected use, but an unbounded export is still a resource-
// exhaustion vector on a shared server.
const MAX_ROWS = 5000

function round1(n) {
  return Math.round((n ?? 0) * 10) / 10
}

function toObjectId(id) {
  return new mongoose.Types.ObjectId(id)
}

function toObjectIds(ids) {
  return ids.map(toObjectId)
}

// Combines any number of id lists (each meaning "must be one of these") into
// a single list. `null`/`undefined` entries mean "no constraint from this
// filter" and are ignored. Returns `null` if none of the filters applied any
// constraint at all, otherwise an array (possibly empty, meaning nothing
// matches every constraint at once).
function intersectIds(...idLists) {
  const constraints = idLists.filter((list) => list !== null && list !== undefined)
  if (constraints.length === 0) return null
  const sets = constraints.map((list) => new Set(list.map((id) => id.toString())))
  const [first, ...rest] = sets
  let result = first
  for (const set of rest) {
    result = new Set([...result].filter((id) => set.has(id)))
  }
  return [...result]
}

function dateRangeMatch(field, filters) {
  const range = {}
  if (filters.dateFrom) range.$gte = filters.dateFrom
  if (filters.dateTo) range.$lte = filters.dateTo
  return Object.keys(range).length ? { [field]: range } : {}
}

async function resolveRoleUserIds(roleName) {
  const role = await roleRepository.findByName(roleName)
  if (!role) return []
  const ids = await User.distinct('_id', { roleId: role._id })
  return ids.map((id) => id.toString())
}

async function employeeProgress(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'jshshir', header: t('col.jshshir') },
    { key: 'department', header: t('col.department') },
    { key: 'isActive', header: t('col.isActive') },
    { key: 'assignedCourses', header: t('col.assignedCourses') },
    { key: 'completedCourses', header: t('col.completedCourses') },
    { key: 'overdueCourses', header: t('col.overdueCourses') },
    { key: 'avgCompletionPercent', header: t('col.avgCompletionPercent') },
    { key: 'totalWatchedMinutes', header: t('col.totalWatchedMinutes') },
  ]

  const now = new Date()

  const courseUserIds = filters.courseId
    ? (await CourseAssignment.distinct('userId', { courseId: filters.courseId })).map((id) => id.toString())
    : null

  const idFilter = intersectIds(filters.roleUserIds, filters.userId ? [filters.userId] : null, courseUserIds)
  if (idFilter && idFilter.length === 0) return { columns, rows: [] }

  const users = await User.find(
    idFilter ? { _id: { $in: idFilter } } : {},
    { fullName: 1, jshshir: 1, department: 1, isActive: 1 }
  )
    .sort({ fullName: 1 })
    .limit(MAX_ROWS)
  const userIds = users.map((u) => u._id)

  const courseScope = filters.courseId ? { courseId: toObjectId(filters.courseId) } : {}

  const [assignmentStats, progressStats] = await Promise.all([
    CourseAssignment.aggregate([
      { $match: { userId: { $in: userIds }, ...courseScope, ...dateRangeMatch('assignedAt', filters) } },
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
      { $match: { userId: { $in: userIds }, ...courseScope, ...dateRangeMatch('lastWatchedAt', filters) } },
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
      jshshir: u.jshshir,
      department: u.department,
      isActive: u.isActive ? t('value.yes') : t('value.no'),
      assignedCourses: a.assignedCourses,
      completedCourses: a.completedCourses,
      overdueCourses: a.overdueCourses,
      avgCompletionPercent: round1(p.avgCompletionPercent),
      totalWatchedMinutes: Math.round((p.totalWatchedSeconds ?? 0) / 60),
    }
  })

  return { columns, rows }
}

async function courseProgress(filters, t) {
  const columns = [
    { key: 'title', header: t('col.course') },
    { key: 'status', header: t('col.status') },
    { key: 'assignedCount', header: t('col.assignedCount') },
    { key: 'completedCount', header: t('col.completedCount') },
    { key: 'avgCompletionPercent', header: t('col.avgCompletionPercent') },
  ]

  const userIdFilter = intersectIds(filters.roleUserIds, filters.userId ? [filters.userId] : null)
  if (userIdFilter && userIdFilter.length === 0) return { columns, rows: [] }
  const userScope = userIdFilter ? { userId: { $in: toObjectIds(userIdFilter) } } : {}

  // Trashed courses are gone from every listing, so they must not resurface
  // in an export either.
  const courses = await Course.find(
    filters.courseId ? { _id: filters.courseId, deletedAt: null } : { deletedAt: null },
    { title: 1, status: 1 }
  )
    .sort({ title: 1 })
    .limit(MAX_ROWS)
  const courseIds = courses.map((c) => c._id)

  const [assignmentStats, progressStats] = await Promise.all([
    CourseAssignment.aggregate([
      { $match: { courseId: { $in: courseIds }, ...userScope, ...dateRangeMatch('assignedAt', filters) } },
      {
        $group: {
          _id: '$courseId',
          assignedCount: { $sum: 1 },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
        },
      },
    ]),
    VideoProgress.aggregate([
      { $match: { courseId: { $in: courseIds }, ...userScope } },
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
      status: t(`courseStatus.${c.status}`, c.status),
      assignedCount: a.assignedCount,
      completedCount: a.completedCount,
      avgCompletionPercent: round1(p.avgCompletionPercent),
    }
  })

  return { columns, rows }
}

async function videoAnalytics(filters, t) {
  const columns = [
    { key: 'title', header: t('col.video') },
    { key: 'viewers', header: t('col.viewers') },
    { key: 'avgCompletionPercent', header: t('col.avgCompletionPercent') },
    { key: 'avgPausesCount', header: t('col.avgPauses') },
    { key: 'avgForwardSeekSeconds', header: t('col.avgSkippedSeconds') },
  ]

  const userIdFilter = intersectIds(filters.roleUserIds, filters.userId ? [filters.userId] : null)
  if (userIdFilter && userIdFilter.length === 0) return { columns, rows: [] }
  const userScope = userIdFilter ? { userId: { $in: toObjectIds(userIdFilter) } } : {}

  const rows = await VideoProgress.aggregate([
    { $match: { ...userScope, ...dateRangeMatch('lastWatchedAt', filters) } },
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
    ...(filters.courseId ? [{ $match: { 'video.courseId': toObjectId(filters.courseId) } }] : []),
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

async function newsAnalytics(filters, t) {
  const columns = [
    { key: 'title', header: t('col.article') },
    { key: 'publishAt', header: t('col.published') },
    { key: 'opens', header: t('col.opens') },
    { key: 'avgReadPercent', header: t('col.avgReadPercent') },
    { key: 'avgTimeSpentSeconds', header: t('col.avgTimeSpentSeconds') },
  ]

  const userIdFilter = intersectIds(filters.roleUserIds, filters.userId ? [filters.userId] : null)
  if (userIdFilter && userIdFilter.length === 0) return { columns, rows: [] }
  const userScope = userIdFilter ? { userId: { $in: toObjectIds(userIdFilter) } } : {}

  const articles = await News.find({ ...dateRangeMatch('publishAt', filters) }, { title: 1, publishAt: 1 })
    .sort({ publishAt: -1 })
    .limit(MAX_ROWS)
  const newsIds = articles.map((n) => n._id)

  const viewStats = await NewsView.aggregate([
    { $match: { newsId: { $in: newsIds }, ...userScope } },
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

async function taskAnalytics(filters, t) {
  const columns = [
    { key: 'title', header: t('col.task') },
    { key: 'assignedTo', header: t('col.assignedTo') },
    { key: 'assignedBy', header: t('col.assignedBy') },
    { key: 'priority', header: t('col.priority') },
    { key: 'status', header: t('col.status') },
    { key: 'deadline', header: t('col.deadline') },
    { key: 'completedAt', header: t('col.completedAt') },
  ]

  const userIdFilter = intersectIds(filters.roleUserIds, filters.userId ? [filters.userId] : null)
  if (userIdFilter && userIdFilter.length === 0) return { columns, rows: [] }
  const assigneeScope = userIdFilter ? { assignedTo: { $in: toObjectIds(userIdFilter) } } : {}

  const rows = await Task.aggregate([
    { $match: { ...assigneeScope, ...dateRangeMatch('deadline', filters) } },
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
      priority: t(`priority.${r.priority}`, r.priority),
      status: t(`taskStatus.${r.status}`, r.status),
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
  // `lang` decides the language of every header and enum value in the file;
  // the data itself (names, course titles) is whatever was typed into it.
  async build(type, filters = {}, lang = DEFAULT_REPORT_LANG) {
    const builder = REPORT_BUILDERS[type]
    if (!builder) throw ApiError.badRequest('Unknown report type', 'UNKNOWN_REPORT_TYPE')
    const roleUserIds = filters.role ? await resolveRoleUserIds(filters.role) : null
    return builder({ ...filters, roleUserIds }, reportTranslator(lang))
  },
}
