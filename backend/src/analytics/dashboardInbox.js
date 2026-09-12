import { PERMISSIONS } from '@lms/shared'
import { User } from '../models/user.model.js'
import { Course } from '../models/course.model.js'
import { CourseQuestion } from '../models/courseQuestion.model.js'
import { NewsComment } from '../models/newsComment.model.js'
import { OnboardingEnrollment } from '../models/onboardingEnrollment.model.js'
import { submissionService } from '../services/assignments/submission.service.js'

/**
 * The operational half of the admin home (rasm 1): what is waiting on
 * somebody right now — unanswered questions, homework to mark, people who
 * joined this month, material written this week, comments under the news.
 *
 * Live, not cached, unlike the figures next to it. A count of 88 requests
 * that was true five minutes ago is a count the admin has already acted
 * on, and every row here is a link to the thing itself, so a stale list
 * would send them to a queue that no longer holds the row.
 */

const DAY = 24 * 60 * 60 * 1000
const TOP_N = 5

// "Filled" for the new-hire card: the fields an HR profile is incomplete
// without. Not the login fields — those exist by construction.
const PROFILE_FIELDS = ['email', 'phone', 'position', 'department', 'branch', 'avatar']

async function unansweredQuestions() {
  return CourseQuestion.countDocuments({ answers: { $size: 0 } })
}

async function gradingQueue(actor) {
  if (!actor.permissions?.includes(PERMISSIONS.QUIZ_GRADE)) return null
  const { items } = await submissionService.queue(actor, { limit: 200 })
  return {
    all: items.length,
    mine: items.filter((row) => row.assignedToMe).length,
    items: items.slice(0, TOP_N),
  }
}

async function newCourses(now) {
  const rows = await Course.find({
    createdAt: { $gte: new Date(now - 7 * DAY) },
    status: { $ne: 'ARCHIVED' },
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .limit(TOP_N)
    .populate('authorIds', 'fullName')
    .populate('createdBy', 'fullName')
    .lean()

  return rows.map((row) => ({
    id: String(row._id),
    title: row.title,
    cover: row.cover ?? '',
    status: row.status,
    createdAt: row.createdAt,
    // The author when one is named, else whoever clicked "new course".
    authors: (row.authorIds?.length ? row.authorIds : [row.createdBy].filter(Boolean)).map((u) => u.fullName),
  }))
}

async function newEmployees(now) {
  const filter = { createdAt: { $gte: new Date(now - 30 * DAY) } }
  const [total, rows] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).limit(TOP_N).lean(),
  ])
  const enrollments = rows.length
    ? await OnboardingEnrollment.find({ userId: { $in: rows.map((r) => r._id) } }, { userId: 1, status: 1, completionPercent: 1 }).lean()
    : []
  const onboardingByUser = new Map(enrollments.map((e) => [String(e.userId), e]))

  return {
    total,
    items: rows.map((row) => {
      const onboarding = onboardingByUser.get(String(row._id))
      return {
        id: String(row._id),
        fullName: row.fullName,
        department: row.department ?? '',
        avatar: row.avatar ?? '',
        filledFields: PROFILE_FIELDS.filter((field) => Boolean(row[field])).length,
        totalFields: PROFILE_FIELDS.length,
        // What is waiting on this person: an onboarding run, or nobody
        // has started one, or an account that was never switched on.
        onboarding: onboarding ? { status: onboarding.status, completionPercent: onboarding.completionPercent } : null,
        isActive: row.isActive,
        createdAt: row.createdAt,
      }
    }),
  }
}

async function newComments(now) {
  return NewsComment.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY) }, deletedAt: null })
}

export async function computeDashboardInbox(actor, { now = Date.now() } = {}) {
  const [questions, grading, courses, employees, comments] = await Promise.all([
    unansweredQuestions(),
    gradingQueue(actor),
    newCourses(now),
    newEmployees(now),
    newComments(now),
  ])
  return {
    questions: { unanswered: questions },
    grading,
    newCourses: courses,
    newEmployees: employees,
    comments: { newThisWeek: comments },
  }
}
