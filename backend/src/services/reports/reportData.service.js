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
import { scopedUserIdsFor } from '../access/actorScope.js'
import {
  MAX_ROWS,
  ASYNC_MAX_ROWS,
  capFor,
  facetRows,
  countFor,
  round1,
  toObjectId,
  toObjectIds,
  intersectIds,
  dateRangeMatch,
} from './reportHelpers.js'
import { EXTRA_REPORT_BUILDERS } from './reportBuilders.extra.js'

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
  if (idFilter && idFilter.length === 0) return { columns, rows: [], totalRows: 0 }

  const userFilter = idFilter ? { _id: { $in: idFilter } } : {}
  // Counted before the capped fetch, so the report can say how many rows
  // exist rather than how many it happened to return (AT-22).
  const totalRows = await countFor(User, userFilter)

  const users = await User.find(userFilter, { fullName: 1, jshshir: 1, department: 1, isActive: 1 })
    .sort({ fullName: 1 })
    .limit(capFor(filters))
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

  return { columns, rows, totalRows }
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
  if (userIdFilter && userIdFilter.length === 0) return { columns, rows: [], totalRows: 0 }
  const userScope = userIdFilter ? { userId: { $in: toObjectIds(userIdFilter) } } : {}

  // Trashed courses are gone from every listing, so they must not resurface
  // in an export either.
  const courseFilter = filters.courseId ? { _id: filters.courseId, deletedAt: null } : { deletedAt: null }
  const totalRows = await countFor(Course, courseFilter)

  const courses = await Course.find(courseFilter, { title: 1, status: 1 })
    .sort({ title: 1 })
    .limit(capFor(filters))
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

  return { columns, rows, totalRows }
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

  const { rows, totalRows } = await facetRows(
    VideoProgress,
    [
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
    ],
    {
      cap: capFor(filters),
      sort: { viewers: -1 },
      project: {
        _id: 0,
        title: '$video.title',
        viewers: 1,
        avgCompletionPercent: { $round: ['$avgCompletionPercent', 1] },
        avgPausesCount: { $round: ['$avgPausesCount', 1] },
        avgForwardSeekSeconds: { $round: ['$avgForwardSeekSeconds', 1] },
      },
    }
  )

  return { columns, rows, totalRows }
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
  if (userIdFilter && userIdFilter.length === 0) return { columns, rows: [], totalRows: 0 }
  const userScope = userIdFilter ? { userId: { $in: toObjectIds(userIdFilter) } } : {}

  const newsFilter = { ...dateRangeMatch('publishAt', filters) }
  const totalRows = await countFor(News, newsFilter)

  const articles = await News.find(newsFilter, { title: 1, publishAt: 1 })
    .sort({ publishAt: -1 })
    .limit(capFor(filters))
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

  return { columns, rows, totalRows }
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
  if (userIdFilter && userIdFilter.length === 0) return { columns, rows: [], totalRows: 0 }
  const assigneeScope = userIdFilter ? { assignedTo: { $in: toObjectIds(userIdFilter) } } : {}

  const taskFilter = { ...assigneeScope, ...dateRangeMatch('deadline', filters) }
  const totalRows = await countFor(Task, taskFilter)

  const rows = await Task.aggregate([
    { $match: taskFilter },
    { $sort: { createdAt: -1 } },
    { $limit: capFor(filters) },
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
    totalRows,
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
  // The seventeen reports the platform grew in blocks 3–7. Kept in their
  // own file for length, registered here so there is still one list of
  // what a report type can be.
  ...EXTRA_REPORT_BUILDERS,
}

export const REPORT_TYPES = Object.keys(REPORT_BUILDERS)

// Re-exported so callers that already import them from here keep working —
// the constants live in reportHelpers.js now that two builder files need
// them.
export { MAX_ROWS, ASYNC_MAX_ROWS }

export const reportDataService = {
  // `lang` decides the language of every header and enum value in the file;
  // the data itself (names, course titles) is whatever was typed into it.
  //
  // `actor` is not optional in practice: every builder narrows its population
  // through `roleUserIds`, and the caller's own scope is folded into that same
  // list here. Doing it in this one place is deliberate — each builder already
  // intersects `roleUserIds` with its other filters, so the fence lands on all
  // of them at once and a new report cannot forget to apply it.
  //
  // `scopedUserIds` may be supplied by scopeToManagedUsers.middleware, which
  // has already computed and cached it for this request. It is an
  // optimisation, never a requirement: `undefined` means nobody handed one
  // over and the fence is computed here, so a route that forgets the
  // middleware is still fenced. `null` is a real answer — no constraint.
  async build(actor, type, filters = {}, lang = DEFAULT_REPORT_LANG, { scopedUserIds } = {}) {
    const builder = REPORT_BUILDERS[type]
    if (!builder) throw ApiError.badRequest('Unknown report type', 'UNKNOWN_REPORT_TYPE')

    const [roleUserIds, scopeUserIds] = await Promise.all([
      filters.role ? resolveRoleUserIds(filters.role) : null,
      scopedUserIds === undefined ? scopedUserIdsFor(actor) : scopedUserIds,
    ])

    // Both are "must be one of these" lists, so they combine the same way the
    // builders combine their own: intersect, and treat null as no constraint.
    const population = intersectIds(roleUserIds, scopeUserIds)
    const result = await builder({ ...filters, roleUserIds: population }, reportTranslator(lang))

    // AT-22: the cap is fine, the silence was not. A caller now always
    // learns how many rows exist and whether it got all of them, so an
    // export of 5 000 out of 8 000 cannot be mistaken for a complete one.
    const totalRows = result.totalRows ?? result.rows.length
    return {
      ...result,
      totalRows,
      exportedRows: result.rows.length,
      truncated: totalRows > result.rows.length,
      maxRows: capFor(filters),
    }
  },
}
