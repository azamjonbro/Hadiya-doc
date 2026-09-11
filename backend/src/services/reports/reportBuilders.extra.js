import { Certificate } from '../../models/certificate.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { QuizAttempt } from '../../models/quizAttempt.model.js'
import { OnboardingEnrollment } from '../../models/onboardingEnrollment.model.js'
import { EventRegistration } from '../../models/eventRegistration.model.js'
import { Submission } from '../../models/submission.model.js'
import { MailLog } from '../../models/mailLog.model.js'
import { KbArticle } from '../../models/kbArticle.model.js'
import { Group } from '../../models/group.model.js'
import { User } from '../../models/user.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { UserBadge } from '../../models/userBadge.model.js'
import { Session } from '../../models/session.model.js'
import { MaterialProgress } from '../../models/materialProgress.model.js'
import { RecurringAssignment } from '../../models/recurringAssignment.model.js'
import { Course } from '../../models/course.model.js'

// Imported for their side effect: `populate()` needs the referenced model
// registered with Mongoose, and these are only ever reached through a
// populate here. Without the import the report fails at runtime with
// "Schema hasn't been registered for model X" — which is how this list was
// discovered.
import '../../models/learningPath.model.js'
import '../../models/testQuiz.model.js'
import '../../models/onboardingProgram.model.js'
import '../../models/event.model.js'
import '../../models/assignment.model.js'
import '../../models/badge.model.js'
import '../../models/material.model.js'
import {
  capFor,
  countFor,
  facetRows,
  intersectIds,
  isoDate,
  round1,
  toObjectIds,
  dateRangeMatch,
} from './reportHelpers.js'

/**
 * The reports the platform grew in blocks 3–7.
 *
 * Every builder here follows the same three rules as the original five:
 *
 *   - it narrows through `filters.roleUserIds`, which is where the caller's
 *     scope has already been folded in — a report that forgets this is a
 *     report that shows a supervisor the whole company
 *   - it caps at `capFor(filters)` and returns the *true* `totalRows`, so a
 *     truncated export cannot be mistaken for a complete one (AT-22)
 *   - its headers come from `t()`, because the file is read in Excel where
 *     the UI's translations do not reach
 *
 * A separate file from reportData.service.js purely for length: seventeen
 * builders in one 1 500-line module is a file nobody opens twice.
 */

/** The population this build may see, as ObjectIds, or null for "everybody". */
function population(filters) {
  return intersectIds(filters.roleUserIds, filters.userId ? [filters.userId] : null)
}

/** Narrows a query to the population. Empty means nothing matches. */
function scopeMatch(ids, field = 'userId') {
  return ids ? { [field]: { $in: toObjectIds(ids) } } : {}
}

const empty = (columns) => ({ columns, rows: [], totalRows: 0 })

// --- Certificates -----------------------------------------------------

/** The audit-ready register: what was issued, to whom, and whether it stands. */
async function certificateRegister(filters, t) {
  const columns = [
    { key: 'serial', header: t('col.serial', 'Serial') },
    { key: 'fullName', header: t('col.fullName') },
    { key: 'title', header: t('col.subject', 'Subject') },
    { key: 'issuedAt', header: t('col.issuedAt', 'Issued') },
    { key: 'validUntil', header: t('col.validUntil', 'Valid until') },
    { key: 'state', header: t('col.status') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = { ...scopeMatch(ids), ...dateRangeMatch('issuedAt', filters) }
  const totalRows = await countFor(Certificate, filter)
  const rows = await Certificate.find(filter).sort({ issuedAt: -1 }).limit(capFor(filters)).lean()

  const now = new Date()
  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      serial: row.serial,
      fullName: row.fullName,
      title: row.sourceTitle,
      issuedAt: isoDate(row.issuedAt),
      validUntil: isoDate(row.validUntil),
      // The same three states the public verification page reports, so an
      // auditor comparing the register with a QR code sees one answer.
      state: row.revokedAt
        ? t('certState.REVOKED', 'Revoked')
        : row.validUntil && row.validUntil < now
          ? t('certState.EXPIRED', 'Expired')
          : t('certState.VALID', 'Valid'),
    })),
  }
}

// --- Learning paths ---------------------------------------------------

async function pathProgress(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'path', header: t('col.path', 'Path') },
    { key: 'status', header: t('col.status') },
    { key: 'completionPercent', header: t('col.avgCompletionPercent') },
    { key: 'deadline', header: t('col.deadline') },
    { key: 'completedAt', header: t('col.completedAt') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = scopeMatch(ids)
  // The builder's "Hisobotlar" tab asks about one path.
  if (filters.pathId) filter.pathId = filters.pathId
  const totalRows = await countFor(PathEnrollment, filter)
  const rows = await PathEnrollment.find(filter)
    .sort({ completionPercent: 1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('pathId', 'title')
    .lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      path: row.pathId?.title ?? '',
      status: t(`pathStatus.${row.status}`, row.status),
      completionPercent: row.completionPercent ?? 0,
      deadline: isoDate(row.deadline),
      completedAt: isoDate(row.completedAt),
    })),
  }
}

// --- Tests ------------------------------------------------------------

async function quizResults(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'quiz', header: t('col.quiz', 'Test') },
    { key: 'attemptNo', header: t('col.attemptNo', 'Attempt') },
    { key: 'scorePercent', header: t('col.score', 'Score, %') },
    { key: 'passed', header: t('col.passed', 'Passed') },
    { key: 'takenAt', header: t('col.takenAt', 'Taken') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = { ...scopeMatch(ids), ...dateRangeMatch('createdAt', filters) }
  if (filters.courseId) filter.courseId = filters.courseId

  const totalRows = await countFor(QuizAttempt, filter)
  const rows = await QuizAttempt.find(filter)
    .sort({ createdAt: -1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('testQuizId', 'title')
    .lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      // Attempts written before the 4.2 merge have no unified test to name.
      quiz: row.testQuizId?.title ?? t('legacyQuiz', '(legacy quiz)'),
      attemptNo: row.attemptNo ?? 1,
      scorePercent: row.scorePercent ?? 0,
      passed: row.passed ? t('yes', 'Yes') : t('no', 'No'),
      takenAt: isoDate(row.createdAt),
    })),
  }
}

/**
 * Which questions people get wrong.
 *
 * Read from `perQuestion`, written at grading time — not recomputed from
 * the questions as they stand now, so an author who fixes a wrong answer
 * key does not retroactively rewrite how everybody did.
 */
async function questionDifficulty(filters, t) {
  const columns = [
    { key: 'text', header: t('col.question', 'Question') },
    { key: 'asked', header: t('col.asked', 'Asked') },
    { key: 'correct', header: t('col.correct', 'Correct') },
    { key: 'correctRate', header: t('col.correctRate', 'Correct, %') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const { rows, totalRows } = await facetRows(
    QuizAttempt,
    [
      { $match: { ...scopeMatch(ids), ...dateRangeMatch('createdAt', filters) } },
      { $unwind: '$perQuestion' },
      {
        $group: {
          _id: '$perQuestion.questionId',
          asked: { $sum: 1 },
          correct: { $sum: { $cond: ['$perQuestion.correct', 1, 0] } },
        },
      },
      { $lookup: { from: 'questions', localField: '_id', foreignField: '_id', as: 'question' } },
      { $unwind: { path: '$question', preserveNullAndEmptyArrays: true } },
    ],
    {
      cap: capFor(filters),
      // Hardest first: the reason anybody opens this report is to find the
      // question that is not working.
      sort: { correct: 1 },
      project: {
        _id: 0,
        text: { $ifNull: ['$question.text', '(deleted question)'] },
        asked: 1,
        correct: 1,
        correctRate: {
          $cond: [{ $gt: ['$asked', 0] }, { $round: [{ $multiply: [{ $divide: ['$correct', '$asked'] }, 100] }, 0] }, 0],
        },
      },
    }
  )

  return { columns, rows, totalRows }
}

// --- Compliance -------------------------------------------------------

/**
 * One row per person per recurring rule.
 *
 * Flattened rather than a matrix, because a spreadsheet is filtered and
 * pivoted — a wide matrix is what the screen is for.
 */
async function complianceStatus(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'department', header: t('col.department') },
    { key: 'course', header: t('col.course') },
    { key: 'state', header: t('col.status') },
    { key: 'completedAt', header: t('col.completedAt') },
    { key: 'expiresAt', header: t('col.validUntil', 'Valid until') },
  ]

  const rules = await RecurringAssignment.find({ active: true }).lean()
  if (!rules.length) return empty(columns)

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const courses = await Course.find({ _id: { $in: rules.map((rule) => rule.courseId) } }, { title: 1 }).lean()
  const courseById = new Map(courses.map((course) => [String(course._id), course.title]))

  const assignmentFilter = {
    ...scopeMatch(ids),
    courseId: { $in: rules.map((rule) => rule.courseId) },
  }
  const totalRows = await countFor(CourseAssignment, assignmentFilter)
  const assignments = await CourseAssignment.find(assignmentFilter)
    .sort({ deadline: 1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName department')
    .lean()

  const ruleByCourse = new Map(rules.map((rule) => [String(rule.courseId), rule]))
  const now = new Date()

  return {
    columns,
    totalRows,
    rows: assignments.map((row) => {
      const rule = ruleByCourse.get(String(row.courseId))
      const expiresAt = row.completedAt
        ? new Date(new Date(row.completedAt).setMonth(new Date(row.completedAt).getMonth() + (rule?.intervalMonths ?? 12)))
        : null
      const state =
        row.status === 'ACTIVE'
          ? t('complianceState.DUE', 'Due')
          : expiresAt && expiresAt > now
            ? t('complianceState.VALID', 'Valid')
            : row.completedAt
              ? t('complianceState.EXPIRED', 'Expired')
              : t('complianceState.NEVER', 'Never done')

      return {
        fullName: row.userId?.fullName ?? '',
        department: row.userId?.department ?? '',
        course: courseById.get(String(row.courseId)) ?? '',
        state,
        completedAt: isoDate(row.completedAt),
        expiresAt: isoDate(expiresAt),
      }
    }),
  }
}

// --- Onboarding -------------------------------------------------------

async function onboardingProgress(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'program', header: t('col.program', 'Programme') },
    { key: 'status', header: t('col.status') },
    { key: 'completionPercent', header: t('col.avgCompletionPercent') },
    { key: 'startedAt', header: t('col.startedAt', 'Started') },
    { key: 'dueAt', header: t('col.deadline') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = scopeMatch(ids)
  const totalRows = await countFor(OnboardingEnrollment, filter)
  const rows = await OnboardingEnrollment.find(filter)
    .sort({ startedAt: -1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('programId', 'name')
    .lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      program: row.programId?.name ?? '',
      status: t(`onboardingStatus.${row.status}`, row.status),
      completionPercent: row.completionPercent ?? 0,
      startedAt: isoDate(row.startedAt),
      dueAt: isoDate(row.dueAt),
    })),
  }
}

// --- Events -----------------------------------------------------------

async function eventAttendance(filters, t) {
  const columns = [
    { key: 'event', header: t('col.event', 'Event') },
    { key: 'fullName', header: t('col.fullName') },
    { key: 'status', header: t('col.status') },
    { key: 'registeredAt', header: t('col.registeredAt', 'Registered') },
    { key: 'attendedAt', header: t('col.attendedAt', 'Attended') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = { ...scopeMatch(ids), ...dateRangeMatch('registeredAt', filters) }
  const totalRows = await countFor(EventRegistration, filter)
  const rows = await EventRegistration.find(filter)
    .sort({ registeredAt: -1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('eventId', 'title startAt')
    .lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      event: row.eventId?.title ?? '',
      fullName: row.userId?.fullName ?? '',
      status: t(`regStatus.${row.status}`, row.status),
      registeredAt: isoDate(row.registeredAt),
      attendedAt: isoDate(row.attendedAt),
    })),
  }
}

// --- Homework ---------------------------------------------------------

async function homeworkSubmissions(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'assignment', header: t('col.assignment', 'Assignment') },
    { key: 'attemptNo', header: t('col.attemptNo', 'Attempt') },
    { key: 'status', header: t('col.status') },
    { key: 'score', header: t('col.score', 'Score, %') },
    { key: 'late', header: t('col.late', 'Late') },
    { key: 'submittedAt', header: t('col.submittedAt', 'Submitted') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  // Drafts are not submissions: reporting somebody's unfinished essay as a
  // hand-in would be a false record.
  const filter = { ...scopeMatch(ids), status: { $ne: 'DRAFT' }, ...dateRangeMatch('submittedAt', filters) }
  const totalRows = await countFor(Submission, filter)
  const rows = await Submission.find(filter)
    .sort({ submittedAt: -1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('assignmentId', 'title maxScore')
    .lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      assignment: row.assignmentId?.title ?? '',
      attemptNo: row.attemptNo ?? 1,
      status: t(`submissionStatus.${row.status}`, row.status),
      score: row.score ?? '',
      late: row.late ? t('yes', 'Yes') : t('no', 'No'),
      submittedAt: isoDate(row.submittedAt),
    })),
  }
}

// --- Delivery ---------------------------------------------------------

/**
 * The mail delivery log.
 *
 * Deliberately without the body: MailLog stores the recipient and the
 * subject and never the content, and a report is not the place to start.
 */
async function deliveryLog(filters, t) {
  const columns = [
    { key: 'to', header: t('col.recipient', 'Recipient') },
    { key: 'subject', header: t('col.subject', 'Subject') },
    { key: 'status', header: t('col.status') },
    { key: 'attempts', header: t('col.attempts', 'Attempts') },
    { key: 'sentAt', header: t('col.sentAt', 'Sent') },
    { key: 'error', header: t('col.error', 'Error') },
  ]

  const ids = population(filters)
  const filter = { ...dateRangeMatch('createdAt', filters) }
  // A mail row may have no user (an invitation to an address that has no
  // account yet), so the scope only narrows the ones that do.
  if (ids) filter.userId = { $in: toObjectIds(ids) }

  const totalRows = await countFor(MailLog, filter)
  const rows = await MailLog.find(filter).sort({ createdAt: -1 }).limit(capFor(filters)).lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      to: row.to,
      subject: row.subject,
      status: t(`mailStatus.${row.status}`, row.status),
      attempts: row.attempts ?? 0,
      sentAt: isoDate(row.sentAt),
      error: row.error ?? '',
    })),
  }
}

// --- Knowledge base ---------------------------------------------------

async function kbUsage(filters, t) {
  const columns = [
    { key: 'title', header: t('col.article') },
    { key: 'views', header: t('col.opens') },
    { key: 'helpful', header: t('col.helpful', 'Helpful') },
    { key: 'notHelpful', header: t('col.notHelpful', 'Not helpful') },
    { key: 'publishedAt', header: t('col.published') },
  ]

  const filter = { deletedAt: null, status: 'PUBLISHED' }
  const totalRows = await countFor(KbArticle, filter)
  // Least read first: a knowledge base fails quietly, and the article
  // nobody opens is the one answering a question people do not have.
  const rows = await KbArticle.find(filter).sort({ viewCount: 1 }).limit(capFor(filters)).lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      title: row.title,
      views: row.viewCount ?? 0,
      helpful: row.helpfulCount ?? 0,
      notHelpful: row.notHelpfulCount ?? 0,
      publishedAt: isoDate(row.publishedAt),
    })),
  }
}

// --- Aggregated progress ---------------------------------------------

async function groupProgress(filters, t) {
  const columns = [
    { key: 'name', header: t('col.group', 'Group') },
    { key: 'members', header: t('col.members', 'Members') },
    { key: 'assigned', header: t('col.assignedCount') },
    { key: 'completed', header: t('col.completedCount') },
    { key: 'completionRate', header: t('col.avgCompletionPercent') },
  ]

  const ids = population(filters)
  const totalRows = await countFor(Group, {})
  const groups = await Group.find({}).sort({ name: 1 }).limit(capFor(filters)).lean()

  const rows = []
  for (const group of groups) {
    // A scoped caller sees the group's members they are allowed to see —
    // the group is not the fence, the population is.
    const memberIds = ids
      ? (group.memberIds ?? []).filter((id) => ids.includes(String(id)))
      : (group.memberIds ?? [])

    const [assigned, completed] = await Promise.all([
      CourseAssignment.countDocuments({ userId: { $in: memberIds } }),
      CourseAssignment.countDocuments({ userId: { $in: memberIds }, status: 'COMPLETED' }),
    ])

    rows.push({
      name: group.name,
      members: memberIds.length,
      assigned,
      completed,
      completionRate: assigned ? round1((completed / assigned) * 100) : 0,
    })
  }

  return { columns, rows, totalRows }
}

async function departmentProgress(filters, t) {
  const columns = [
    { key: 'department', header: t('col.department') },
    { key: 'employees', header: t('col.employees', 'Employees') },
    { key: 'assigned', header: t('col.assignedCount') },
    { key: 'completed', header: t('col.completedCount') },
    { key: 'completionRate', header: t('col.avgCompletionPercent') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const users = await User.find({ ...(ids ? { _id: { $in: toObjectIds(ids) } } : {}), isActive: true }, {
    department: 1,
  }).lean()

  const byDepartment = new Map()
  for (const user of users) {
    const key = user.department || t('noDepartment', '(no department)')
    if (!byDepartment.has(key)) byDepartment.set(key, [])
    byDepartment.get(key).push(user._id)
  }

  const rows = []
  for (const [department, memberIds] of byDepartment) {
    const [assigned, completed] = await Promise.all([
      CourseAssignment.countDocuments({ userId: { $in: memberIds } }),
      CourseAssignment.countDocuments({ userId: { $in: memberIds }, status: 'COMPLETED' }),
    ])
    rows.push({
      department,
      employees: memberIds.length,
      assigned,
      completed,
      completionRate: assigned ? round1((completed / assigned) * 100) : 0,
    })
  }

  rows.sort((a, b) => a.completionRate - b.completionRate)
  return { columns, rows: rows.slice(0, capFor(filters)), totalRows: rows.length }
}

// --- Deadlines and audit ---------------------------------------------

async function overdueAssignments(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'course', header: t('col.course') },
    { key: 'deadline', header: t('col.deadline') },
    { key: 'daysOverdue', header: t('col.daysOverdue', 'Days overdue') },
    { key: 'mandatory', header: t('col.mandatory', 'Mandatory') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const now = new Date()
  const filter = { ...scopeMatch(ids), status: 'ACTIVE', deadline: { $ne: null, $lt: now } }
  const totalRows = await countFor(CourseAssignment, filter)
  const rows = await CourseAssignment.find(filter)
    .sort({ deadline: 1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('courseId', 'title')
    .lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      course: row.courseId?.title ?? '',
      deadline: isoDate(row.deadline),
      daysOverdue: Math.floor((now - new Date(row.deadline)) / (24 * 60 * 60 * 1000)),
      mandatory: row.mandatory ? t('yes', 'Yes') : t('no', 'No'),
    })),
  }
}

/** Who assigned what to whom, and when. */
async function enrollmentAudit(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'course', header: t('col.course') },
    { key: 'assignedBy', header: t('col.assignedBy', 'Assigned by') },
    { key: 'assignedAt', header: t('col.assignedAt', 'Assigned') },
    { key: 'mandatory', header: t('col.mandatory', 'Mandatory') },
    { key: 'status', header: t('col.status') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = { ...scopeMatch(ids), ...dateRangeMatch('assignedAt', filters) }
  if (filters.courseId) filter.courseId = filters.courseId

  const totalRows = await countFor(CourseAssignment, filter)
  const rows = await CourseAssignment.find(filter)
    .sort({ assignedAt: -1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('courseId', 'title')
    .populate('assignedBy', 'fullName')
    .lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      course: row.courseId?.title ?? '',
      // An assignment made by a rule rather than a person still has an
      // author — whoever wrote the rule (5.3).
      assignedBy: row.assignedBy?.fullName ?? t('automatic', '(automatic)'),
      assignedAt: isoDate(row.assignedAt),
      mandatory: row.mandatory ? t('yes', 'Yes') : t('no', 'No'),
      status: t(`assignmentStatus.${row.status}`, row.status),
    })),
  }
}

// --- Gamification, sessions, materials -------------------------------

async function badgeAwards(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'badge', header: t('col.badge', 'Badge') },
    { key: 'earnedAt', header: t('col.earnedAt', 'Earned') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = { ...scopeMatch(ids), ...dateRangeMatch('earnedAt', filters) }
  const totalRows = await countFor(UserBadge, filter)
  const rows = await UserBadge.find(filter)
    .sort({ earnedAt: -1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('badgeId', 'name')
    .lean()

  return {
    columns,
    totalRows,
    // The stored code is the fallback: somebody still earned a badge whose
    // definition has since been deleted.
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      badge: row.badgeId?.name || row.code,
      earnedAt: isoDate(row.earnedAt),
    })),
  }
}

/**
 * Session activity.
 *
 * Deliberately without the refresh-token hash, and with the IP included:
 * this is the report somebody reads after a suspected account compromise,
 * and "which addresses has this account signed in from" is the question.
 */
async function loginActivity(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'ip', header: t('col.ip', 'IP address') },
    { key: 'userAgent', header: t('col.device', 'Device') },
    { key: 'createdAt', header: t('col.signedInAt', 'Signed in') },
    { key: 'state', header: t('col.status') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = { ...scopeMatch(ids), ...dateRangeMatch('createdAt', filters) }
  const totalRows = await countFor(Session, filter)
  const rows = await Session.find(filter, { refreshTokenHash: 0 })
    .sort({ createdAt: -1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .lean()

  const now = new Date()
  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      ip: row.ip ?? '',
      userAgent: (row.userAgent ?? '').slice(0, 120),
      createdAt: isoDate(row.createdAt),
      state: row.revoked
        ? t('sessionState.REVOKED', 'Revoked')
        : row.expiresAt < now
          ? t('sessionState.EXPIRED', 'Expired')
          : t('sessionState.ACTIVE', 'Active'),
    })),
  }
}

async function materialUsage(filters, t) {
  const columns = [
    { key: 'fullName', header: t('col.fullName') },
    { key: 'material', header: t('col.material', 'Document') },
    { key: 'completionPercent', header: t('col.avgCompletionPercent') },
    { key: 'pages', header: t('col.pagesRead', 'Pages read') },
    { key: 'lastViewedAt', header: t('col.lastViewedAt', 'Last opened') },
  ]

  const ids = population(filters)
  if (ids && ids.length === 0) return empty(columns)

  const filter = { ...scopeMatch(ids), ...dateRangeMatch('lastViewedAt', filters) }
  if (filters.courseId) filter.courseId = filters.courseId

  const totalRows = await countFor(MaterialProgress, filter)
  const rows = await MaterialProgress.find(filter)
    .sort({ lastViewedAt: -1 })
    .limit(capFor(filters))
    .populate('userId', 'fullName')
    .populate('materialId', 'title')
    .lean()

  return {
    columns,
    totalRows,
    rows: rows.map((row) => ({
      fullName: row.userId?.fullName ?? '',
      material: row.materialId?.title ?? '',
      completionPercent: row.completionPercent ?? 0,
      pages: `${row.viewedPages?.length ?? 0}/${row.totalPages ?? 0}`,
      lastViewedAt: isoDate(row.lastViewedAt),
    })),
  }
}

export const EXTRA_REPORT_BUILDERS = {
  'certificate-register': certificateRegister,
  'path-progress': pathProgress,
  'quiz-results': quizResults,
  'question-difficulty': questionDifficulty,
  'compliance-status': complianceStatus,
  'onboarding-progress': onboardingProgress,
  'event-attendance': eventAttendance,
  'homework-submissions': homeworkSubmissions,
  'delivery-log': deliveryLog,
  'kb-usage': kbUsage,
  'group-progress': groupProgress,
  'department-progress': departmentProgress,
  'overdue-assignments': overdueAssignments,
  'enrollment-audit': enrollmentAudit,
  'badge-awards': badgeAwards,
  'login-activity': loginActivity,
  'material-usage': materialUsage,
}
