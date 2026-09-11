import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { materialProgressRepository } from '../../repositories/materialProgress.repository.js'
import { lessonProgressRepository } from '../../repositories/lessonProgress.repository.js'
import { assessmentAttemptRepository } from '../../repositories/assessmentAttempt.repository.js'
import { ScormState } from '../../models/scormState.model.js'
import { collectCourseItems, summarize, meetsRule } from '../courses/courseCompletion.service.js'

/**
 * The learner's own "what have I studied" table (portal §11): one row per
 * course they were assigned or touched, the items of that course under it,
 * each with a status, a percentage, a score and the time spent.
 *
 * Nothing here is stored. The row is derived from the same progress rows
 * and the same `collectCourseItems` that decide completion, so the history
 * can never show "Tugallangan" for a course the certificate job considers
 * unfinished — the two would only ever disagree if they read different
 * data.
 *
 * Time is honest about what is measured: videos and SCORM packages record
 * their own seconds; documents and text lessons do not (a page left open
 * is not reading), so a course of only documents shows no time rather
 * than an invented one.
 */

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

const maxDate = (...dates) => dates.filter(Boolean).reduce((a, b) => (a && a > b ? a : b), null)
const minDate = (...dates) => dates.filter(Boolean).reduce((a, b) => (a && a < b ? a : b), null)
const toId = (value) => value?.toString()

/** Groups every progress row of the user by course, keyed by item id inside. */
function indexActivity({ videoRows, materialRows, lessonRows, attempts, scormRows }) {
  const byCourse = new Map()
  const course = (courseId) => {
    const key = toId(courseId)
    if (!byCourse.has(key)) {
      byCourse.set(key, { first: null, last: null, items: new Map() })
    }
    return byCourse.get(key)
  }
  const touch = (courseId, itemId, first, last, extra = {}) => {
    const entry = course(courseId)
    entry.first = minDate(entry.first, first)
    entry.last = maxDate(entry.last, last)
    const prev = entry.items.get(toId(itemId)) ?? { first: null, last: null, seconds: 0, scorePercent: null, failed: false }
    entry.items.set(toId(itemId), {
      first: minDate(prev.first, first),
      last: maxDate(prev.last, last),
      seconds: prev.seconds + (extra.seconds ?? 0),
      scorePercent:
        extra.scorePercent == null ? prev.scorePercent : Math.max(prev.scorePercent ?? -1, extra.scorePercent),
      failed: extra.failed ?? prev.failed,
    })
  }

  for (const row of videoRows) {
    touch(row.courseId, row.videoId, row.firstWatchedAt, row.lastWatchedAt ?? row.updatedAt, {
      seconds: row.totalWatchedSeconds ?? 0,
    })
  }
  for (const row of materialRows) touch(row.courseId, row.materialId, row.firstViewedAt, row.lastViewedAt)
  for (const row of lessonRows) touch(row.courseId, row.lessonId, row.firstViewedAt, row.lastViewedAt)
  for (const row of scormRows) {
    touch(row.courseId, row.packageId, row.firstAccessAt, row.lastAccessAt, {
      seconds: row.totalTimeSeconds ?? 0,
      scorePercent: scormPercent(row),
    })
  }
  // Attempts arrive newest first; the latest one decides "failed", the best
  // one is the score shown — a person who passed on the third try passed.
  const latestSeen = new Set()
  for (const attempt of attempts) {
    const key = toId(attempt.assessmentId)
    const latest = !latestSeen.has(key)
    latestSeen.add(key)
    touch(attempt.courseId, attempt.assessmentId, attempt.createdAt, attempt.createdAt, {
      scorePercent: attempt.scorePercent ?? 0,
      failed: latest ? !attempt.passed && !attempt.needsReview : undefined,
    })
  }
  return byCourse
}

function scormPercent(row) {
  if (row.scoreRaw == null) return null
  const max = row.scoreMax ?? 100
  const min = row.scoreMin ?? 0
  if (max <= min) return null
  return Math.round(((row.scoreRaw - min) / (max - min)) * 100)
}

function itemStatus(item, activity) {
  if (item.completed) return 'COMPLETED'
  if (item.kind === 'assessment' && activity?.failed) return 'FAILED'
  if (activity || item.completionPercent > 0) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

function courseStatus({ assignment, items, rule, activity }) {
  if (assignment?.status === 'COMPLETED' || meetsRule(items, rule)) return 'COMPLETED'
  const now = new Date()
  // A deadline that passed with the course unfinished is what iSpring
  // paints red. An expired *access* window is the same story for the
  // learner: they can no longer finish.
  const cutoff = assignment?.expiresAt ?? assignment?.deadline
  if (cutoff && cutoff < now && assignment?.status !== 'CANCELLED') return 'FAILED'
  if (activity?.last || items.some((item) => item.completionPercent > 0)) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

export const learningHistoryService = {
  async getForUser(userId, { page = 1, limit = DEFAULT_LIMIT } = {}) {
    const pageSize = Math.min(Math.max(1, limit), MAX_LIMIT)
    const [assignments, videoRows, materialRows, lessonRows, attempts, scormRows] = await Promise.all([
      courseAssignmentRepository.listByUser(userId),
      videoProgressRepository.listByUser(userId),
      materialProgressRepository.listByUser(userId),
      lessonProgressRepository.listByUser(userId),
      assessmentAttemptRepository.listByUser(userId),
      ScormState.find({ userId }),
    ])

    const activityByCourse = indexActivity({ videoRows, materialRows, lessonRows, attempts, scormRows })
    const assignmentByCourse = new Map(assignments.map((row) => [toId(row.courseId), row]))

    // Assigned courses and courses reached from the catalog without an
    // assignment both belong here — the second kind only exists in the
    // progress collections.
    const courseIds = new Set([...assignmentByCourse.keys(), ...activityByCourse.keys()])
    const ordered = [...courseIds]
      .map((courseId) => ({
        courseId,
        // The row's date is the last thing that happened in it; an untouched
        // assignment sorts by when it was handed out.
        at: activityByCourse.get(courseId)?.last ?? assignmentByCourse.get(courseId)?.assignedAt ?? null,
      }))
      .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))

    const total = ordered.length
    const start = (page - 1) * pageSize
    const slice = ordered.slice(start, start + pageSize)

    const courses = await courseRepository.findByIds(slice.map((row) => row.courseId))
    const courseById = new Map(courses.map((course) => [toId(course._id), course]))

    const rows = await Promise.all(
      slice.map(async ({ courseId, at }) => {
        const course = courseById.get(courseId)
        // Trashed or hard-deleted course: the progress rows outlive it, but
        // there is nothing left to name, so the row is dropped rather than
        // shown as "(o'chirilgan)".
        if (!course) return null
        const items = await collectCourseItems(courseId, userId)
        const activity = activityByCourse.get(courseId)
        const assignment = assignmentByCourse.get(courseId)
        const children = items.map((item) => {
          const itemActivity = activity?.items.get(item.id)
          return {
            kind: item.kind,
            id: item.id,
            title: item.title,
            status: itemStatus(item, itemActivity),
            completionPercent: item.completionPercent,
            scorePercent: itemActivity?.scorePercent ?? null,
            timeSeconds: itemActivity?.seconds ?? 0,
            lastActivityAt: itemActivity?.last ?? null,
          }
        })
        const scored = children.filter((child) => child.scorePercent != null)
        return {
          courseId,
          title: course.title,
          cover: course.cover ?? null,
          status: courseStatus({ assignment, items, rule: course.completionRule, activity }),
          completionPercent: summarize(items).completionPercent,
          // The best test result in the course, as the certificate would
          // report it; null when the course has no scored item yet.
          scorePercent: scored.length ? Math.max(...scored.map((child) => child.scorePercent)) : null,
          timeSeconds: children.reduce((sum, child) => sum + child.timeSeconds, 0),
          startedAt: activity?.first ?? null,
          lastActivityAt: at,
          assignedAt: assignment?.assignedAt ?? null,
          deadline: assignment?.deadline ?? null,
          completedAt: assignment?.completedAt ?? null,
          items: children,
        }
      })
    )

    return {
      items: rows.filter(Boolean),
      page,
      limit: pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  },
}
