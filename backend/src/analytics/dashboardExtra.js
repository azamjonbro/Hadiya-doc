import { QuizAttempt } from '../models/quizAttempt.model.js'
import { Certificate } from '../models/certificate.model.js'
import { Event } from '../models/event.model.js'
import { EventRegistration } from '../models/eventRegistration.model.js'
import { PathEnrollment } from '../models/pathEnrollment.model.js'
import { RecurringAssignment } from '../models/recurringAssignment.model.js'

/**
 * The dashboard figures for everything the platform grew in blocks 3–7
 * (8.5).
 *
 * Kept in its own file for the same reason the extra report builders are:
 * the original aggregation is a readable length and doubling it in place
 * would end that. computeDashboard still assembles one payload, so there is
 * still one answer to "what is on the dashboard".
 *
 * Every figure here is company-wide, like the rest of the cached payload.
 * The scoped version of this page is /dashboard/team, which is its own
 * aggregation over its own population — mixing the two would mean a cached
 * company number appearing on a fenced person's screen.
 */

const TOP_N = 10
const EXPIRY_WINDOW_DAYS = 30
const CERTIFICATE_TREND_MONTHS = 6

export async function extraCards({ now = new Date() } = {}) {
  const expiryHorizon = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [
    quizTotals,
    certificatesIssued,
    certificatesExpiringSoon,
    upcomingEvents,
    pathEnrollmentsActive,
    pathEnrollmentsCompleted,
    complianceRules,
  ] = await Promise.all([
    // Attempts and passes in one pass — two counts of the same collection
    // is two scans for one ratio.
    QuizAttempt.aggregate([
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          passed: { $sum: { $cond: ['$passed', 1, 0] } },
        },
      },
    ]),
    Certificate.countDocuments({ revokedAt: null }),
    // Only the ones that actually expire: a certificate with no validUntil
    // is valid indefinitely and must not be counted as expiring.
    Certificate.countDocuments({
      revokedAt: null,
      validUntil: { $ne: null, $gt: now, $lte: expiryHorizon },
    }),
    Event.countDocuments({ status: 'PUBLISHED', startAt: { $gt: now } }),
    PathEnrollment.countDocuments({ status: 'ACTIVE' }),
    PathEnrollment.countDocuments({ status: 'COMPLETED' }),
    RecurringAssignment.countDocuments({ active: true }),
  ])

  const attempts = quizTotals[0]?.attempts ?? 0
  const passed = quizTotals[0]?.passed ?? 0

  return {
    quizAttempts: attempts,
    // Rounded to one decimal like every other percentage on this page. Zero
    // attempts is 0%, not NaN — a dashboard on a fresh install has to render.
    quizPassRatePercent: attempts ? Math.round((passed / attempts) * 1000) / 10 : 0,
    certificatesIssued,
    certificatesExpiringSoon,
    upcomingEvents,
    pathEnrollmentsActive,
    pathEnrollmentsCompleted,
    complianceRules,
  }
}

/** Average completion per learning path, busiest first. */
async function pathProgressChart() {
  return PathEnrollment.aggregate([
    {
      $group: {
        _id: '$pathId',
        learners: { $sum: 1 },
        avgCompletion: { $avg: '$completionPercent' },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
      },
    },
    { $sort: { learners: -1 } },
    { $limit: TOP_N },
    { $lookup: { from: 'learningpaths', localField: '_id', foreignField: '_id', as: 'path' } },
    { $unwind: '$path' },
    {
      $project: {
        _id: 0,
        pathId: '$_id',
        title: '$path.title',
        learners: 1,
        completed: 1,
        avgCompletion: { $round: ['$avgCompletion', 1] },
      },
    },
  ])
}

/**
 * Turnout per event: how many came against how many said they would.
 *
 * WAITLIST and CANCELLED are excluded from the denominator on purpose —
 * somebody who never got a place, or who withdrew, did not fail to turn up.
 * Counting them would make a full event with a long waiting list look like
 * poor attendance.
 */
async function eventAttendanceChart({ now = new Date() } = {}) {
  return EventRegistration.aggregate([
    { $match: { status: { $in: ['REGISTERED', 'ATTENDED', 'NO_SHOW'] } } },
    {
      $group: {
        _id: '$eventId',
        expected: { $sum: 1 },
        attended: { $sum: { $cond: [{ $eq: ['$status', 'ATTENDED'] }, 1, 0] } },
      },
    },
    { $lookup: { from: 'events', localField: '_id', foreignField: '_id', as: 'event' } },
    { $unwind: '$event' },
    // Events that have happened: turnout is not a question you can ask about
    // next week's seminar.
    { $match: { 'event.startAt': { $lte: now } } },
    { $sort: { 'event.startAt': -1 } },
    { $limit: TOP_N },
    {
      $project: {
        _id: 0,
        eventId: '$_id',
        title: '$event.title',
        startAt: '$event.startAt',
        expected: 1,
        attended: 1,
        attendancePercent: {
          $round: [{ $multiply: [{ $divide: ['$attended', { $max: ['$expected', 1] }] }, 100] }, 1],
        },
      },
    },
  ])
}

/** Certificates issued per month over the last six, zero-filled. */
async function certificateTrend({ now = new Date() } = {}) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CERTIFICATE_TREND_MONTHS - 1), 1))

  const rows = await Certificate.aggregate([
    { $match: { revokedAt: null, issuedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$issuedAt' } },
        count: { $sum: 1 },
      },
    },
  ])

  // Zero-filled, so the series is a continuous six months rather than only
  // the months that happen to have data — a gap in a trend line reads as
  // missing information, not as nothing having happened.
  const byMonth = new Map(rows.map((row) => [row._id, row.count]))
  const series = []
  for (let index = CERTIFICATE_TREND_MONTHS - 1; index >= 0; index -= 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
    const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`
    series.push({ month: key, count: byMonth.get(key) ?? 0 })
  }
  return series
}

/** Pass rate per quiz, hardest first — the ones worth looking at. */
async function quizDifficultyChart() {
  return QuizAttempt.aggregate([
    {
      $group: {
        _id: '$quizId',
        attempts: { $sum: 1 },
        passed: { $sum: { $cond: ['$passed', 1, 0] } },
        avgScore: { $avg: '$scorePercent' },
      },
    },
    // One person's single failed attempt is not a difficulty signal.
    { $match: { attempts: { $gte: 3 } } },
    {
      $addFields: {
        passRatePercent: { $round: [{ $multiply: [{ $divide: ['$passed', '$attempts'] }, 100] }, 1] },
      },
    },
    { $sort: { passRatePercent: 1 } },
    { $limit: TOP_N },
    { $lookup: { from: 'quizzes', localField: '_id', foreignField: '_id', as: 'quiz' } },
    { $unwind: '$quiz' },
    {
      $project: {
        _id: 0,
        quizId: '$_id',
        title: '$quiz.title',
        attempts: 1,
        passRatePercent: 1,
        avgScore: { $round: ['$avgScore', 1] },
      },
    },
  ])
}

export async function extraCharts({ now = new Date() } = {}) {
  const [pathProgress, eventAttendance, certificatesByMonth, quizDifficulty] = await Promise.all([
    pathProgressChart(),
    eventAttendanceChart({ now }),
    certificateTrend({ now }),
    quizDifficultyChart(),
  ])

  return { pathProgress, eventAttendance, certificatesByMonth, quizDifficulty }
}
