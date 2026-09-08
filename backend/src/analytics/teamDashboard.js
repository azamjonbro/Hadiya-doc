import { User } from '../models/user.model.js'
import { CourseAssignment } from '../models/courseAssignment.model.js'
import { VideoProgress } from '../models/videoProgress.model.js'
import { Task } from '../models/task.model.js'

/**
 * The dashboard a manager gets, for the people they answer for.
 *
 * Computed live rather than pre-aggregated, unlike the company-wide one.
 * That is not an oversight: the cached dashboard exists because aggregating
 * every employee is expensive and every admin wants the same answer, so it
 * is worth computing once on a schedule. A team is tens of people and every
 * manager wants a *different* answer, so caching would mean one entry per
 * manager, each stale by up to five minutes, to save a query that takes
 * milliseconds over a few dozen rows.
 *
 * It is also a deliberately smaller thing than the admin dashboard. A
 * manager needs to know who is behind and what is overdue; the "most paused
 * video" chart is a content-authoring question, not a management one.
 */

const TOP_N = 5

const toIds = (ids) => ids.map((id) => (typeof id === 'string' ? id : String(id)))

async function cards(userIds, now) {
  const [assignments, overdue, activeLearners, openTasks] = await Promise.all([
    CourseAssignment.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CourseAssignment.countDocuments({
      userId: { $in: userIds },
      status: 'ACTIVE',
      deadline: { $ne: null, $lt: now },
    }),
    // "Active" is someone who has watched something in the last 30 days.
    // Distinct rather than a count of rows: one person watching ten videos
    // is one active learner, and the number is read as a headcount.
    VideoProgress.distinct('userId', {
      userId: { $in: userIds },
      updatedAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
    }),
    Task.countDocuments({ assignedTo: { $in: userIds }, status: { $ne: 'DONE' } }),
  ])

  const byStatus = Object.fromEntries(assignments.map((row) => [row._id, row.count]))
  const assigned = Object.values(byStatus).reduce((sum, count) => sum + count, 0)
  const completed = byStatus.COMPLETED ?? 0

  return {
    teamSize: userIds.length,
    coursesAssigned: assigned,
    coursesCompleted: completed,
    // Whole percent: a manager reads this as "roughly how far along is my
    // team", and a decimal implies a precision the number does not have.
    completionRate: assigned ? Math.round((completed / assigned) * 100) : 0,
    overdue,
    activeLast30Days: activeLearners.length,
    openTasks,
  }
}

/**
 * Per-person progress, worst first.
 *
 * Worst first because that is the question a manager opens this to answer.
 * A leaderboard sorted the other way is a different feature, and it already
 * exists.
 */
async function memberProgress(userIds) {
  const [people, progress, assignments] = await Promise.all([
    User.find({ _id: { $in: userIds }, isActive: true }, { fullName: 1, position: 1, avatar: 1 }).lean(),
    VideoProgress.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', avgCompletion: { $avg: '$completionPercent' }, lastActivity: { $max: '$updatedAt' } } },
    ]),
    CourseAssignment.aggregate([
      { $match: { userId: { $in: userIds } } },
      {
        $group: {
          _id: '$userId',
          assigned: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
        },
      },
    ]),
  ])

  const progressByUser = new Map(progress.map((row) => [String(row._id), row]))
  const assignmentsByUser = new Map(assignments.map((row) => [String(row._id), row]))

  return people
    .map((person) => {
      const id = String(person._id)
      const own = progressByUser.get(id)
      const counts = assignmentsByUser.get(id)
      return {
        id,
        fullName: person.fullName,
        position: person.position ?? '',
        avatar: person.avatar ?? '',
        avgCompletion: own ? Math.round(own.avgCompletion) : 0,
        coursesAssigned: counts?.assigned ?? 0,
        coursesCompleted: counts?.completed ?? 0,
        // Null rather than 0 or "now": "has never watched anything" is a
        // different fact from "watched something long ago", and a manager
        // needs to tell them apart.
        lastActivityAt: own?.lastActivity ? new Date(own.lastActivity).toISOString() : null,
      }
    })
    .sort((a, b) => a.avgCompletion - b.avgCompletion)
}

/** Deadlines about to bite, soonest first — the other thing a manager opens this for. */
async function upcomingDeadlines(userIds, now) {
  const rows = await CourseAssignment.aggregate([
    {
      $match: {
        userId: { $in: userIds },
        status: 'ACTIVE',
        deadline: { $ne: null, $gte: now, $lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) },
      },
    },
    { $sort: { deadline: 1 } },
    { $limit: 20 },
    { $lookup: { from: 'courses', localField: 'courseId', foreignField: '_id', as: 'course' } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$course' },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        courseId: '$courseId',
        courseTitle: '$course.title',
        userId: '$userId',
        fullName: '$user.fullName',
        deadline: 1,
      },
    },
  ])
  return rows.map((row) => ({ ...row, deadline: new Date(row.deadline).toISOString() }))
}

export async function computeTeamDashboard(userIdStrings, now = new Date()) {
  const ids = toIds(userIdStrings)
  if (!ids.length) {
    // A manager with nobody under them gets a shaped, empty answer rather
    // than a 404 or a null: the page renders "nobody reports to you yet",
    // which is a real and recoverable state during an org import.
    return {
      cards: {
        teamSize: 0,
        coursesAssigned: 0,
        coursesCompleted: 0,
        completionRate: 0,
        overdue: 0,
        activeLast30Days: 0,
        openTasks: 0,
      },
      members: [],
      needsAttention: [],
      upcomingDeadlines: [],
      generatedAt: now.toISOString(),
    }
  }

  const objectIds = await User.find({ _id: { $in: ids } }, { _id: 1 }).lean()
  const matchIds = objectIds.map((row) => row._id)

  const [cardData, members, deadlines] = await Promise.all([
    cards(matchIds, now),
    memberProgress(matchIds),
    upcomingDeadlines(matchIds, now),
  ])

  return {
    cards: cardData,
    members,
    // The same list, cut to the few worth a conversation this week. Kept
    // separate so the page does not have to decide what "behind" means.
    needsAttention: members.filter((member) => member.coursesAssigned > 0 && member.avgCompletion < 50).slice(0, TOP_N),
    upcomingDeadlines: deadlines,
    generatedAt: now.toISOString(),
  }
}
