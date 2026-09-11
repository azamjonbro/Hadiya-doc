import { LearningPath } from '../../models/learningPath.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { PERMISSIONS } from '@lms/shared'

/**
 * Path progression — the same shape as courseSequence.js, one level up.
 *
 * A course sequences videos; a path sequences whole courses. The rules are
 * deliberately the same, because a learner who has understood one should
 * not have to learn the other:
 *
 *   - only *required* items gate what follows, so an optional extra course
 *     cannot wall off the rest of the programme
 *   - an item already completed never re-locks, so revisiting is possible
 *   - the check lives on the server, at the point a playback token is
 *     issued. A lock that exists only in the sidebar is bypassed by typing
 *     the URL, which is exactly what AT-26 tests.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function canManagePaths(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

/** Items in the order they are taken. Sections are presentation only. */
export function orderedItems(path) {
  return [...(path.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/**
 * refId -> { locked, blockedBy } for one learner.
 *
 * `completedRefIds` is what they have finished, whatever the item type — a
 * course assignment marked COMPLETED, an event attended, an assignment
 * graded. Keeping the lock rule ignorant of *how* an item is completed is
 * what lets Blok 6 add event items without touching this.
 */
export function computeItemLocks(path, completedRefIds, { startAt = null, now = new Date() } = {}) {
  const done = new Set([...completedRefIds].map(String))
  const locks = {}
  let blocker = null
  const byDays = path.orderMode === 'BY_DAYS'

  for (const item of orderedItems(path)) {
    const id = String(item.refId)
    const completed = done.has(id)

    // Explicit prerequisites are checked whether or not the path is
    // sequential: they are a statement about this item, not about order.
    const missingPrerequisite = (item.prerequisiteIds ?? []).map(String).find((refId) => !done.has(refId))
    // BY_DAYS: "Kun 10" opens ten days after the enrolment started. With
    // no enrolment (an administrator previewing) nothing is time-locked.
    const opensAt = byDays && startAt && item.startDay ? new Date(new Date(startAt).getTime() + item.startDay * DAY_MS) : null

    if (missingPrerequisite) {
      locks[id] = { locked: true, blockedBy: missingPrerequisite }
    } else if (path.sequential && blocker && !completed) {
      locks[id] = { locked: true, blockedBy: blocker }
    } else if (opensAt && opensAt > now && !completed) {
      locks[id] = { locked: true, blockedBy: null, opensAt }
    } else {
      locks[id] = { locked: false, blockedBy: null }
    }

    // The first unfinished *required* item closes everything after it.
    if (path.sequential && !blocker && !completed && item.required !== false) blocker = id
  }

  return locks
}

/**
 * The percentage, over the required items only (AT-27).
 *
 * An optional item finished is a good thing and not progress: counting it
 * would let somebody reach 100% having skipped a mandatory course, and
 * leaving it in the denominator would keep a learner who did everything
 * they were asked to do at 60% forever.
 */
export function summarizeEnrollment(path, completedRefIds) {
  const done = new Set([...completedRefIds].map(String))
  const required = orderedItems(path).filter((item) => item.required !== false)
  const completed = required.filter((item) => done.has(String(item.refId))).length

  return {
    completionPercent: required.length ? Math.round((completed / required.length) * 100) : 0,
    completedRequired: completed,
    totalRequired: required.length,
    // An empty path is not complete. Same reasoning as an empty course:
    // calling it finished hands out a certificate for nothing.
    complete: required.length > 0 && completed === required.length,
  }
}

/** Which of this person's course items are done, read from the assignments. */
export async function completedRefIdsFor(userId, path) {
  const courseItemIds = orderedItems(path)
    .filter((item) => item.type === 'COURSE')
    .map((item) => item.refId)
  if (!courseItemIds.length) return []

  const assignments = await courseAssignmentRepository.listByUser(String(userId))
  const completed = new Set(
    assignments
      .filter((assignment) => assignment.status === 'COMPLETED')
      .map((assignment) => String(assignment.courseId))
  )
  return courseItemIds.filter((refId) => completed.has(String(refId))).map(String)
}

/**
 * Refuses to open a course that an enrolled path has not unlocked yet.
 *
 * Called from the video-access path, next to the course-level check, for
 * the same reason: without a playback token there is nothing to play, so
 * that is where the refusal has to land (AT-26).
 *
 * Only enrolments the learner actually holds are consulted. A course that
 * also happens to appear in somebody else's programme is none of their
 * business, and a path they are not on must not be able to lock them out.
 */
export async function assertPathItemUnlocked(actor, courseId) {
  if (canManagePaths(actor)) return

  const enrollments = await PathEnrollment.find({ userId: actor.id, status: 'ACTIVE' }).lean()
  if (!enrollments.length) return

  const paths = await LearningPath.find({
    _id: { $in: enrollments.map((enrollment) => enrollment.pathId) },
    deletedAt: null,
    $or: [{ sequential: true }, { orderMode: 'BY_DAYS' }],
  }).lean()
  const enrollmentByPath = new Map(enrollments.map((row) => [String(row.pathId), row]))

  for (const path of paths) {
    const item = orderedItems(path).find(
      (entry) => entry.type === 'COURSE' && String(entry.refId) === String(courseId)
    )
    if (!item) continue

    const completed = await completedRefIdsFor(actor.id, path)
    const startAt = enrollmentByPath.get(String(path._id))?.startAt ?? null
    const state = computeItemLocks(path, completed, { startAt })[String(courseId)]
    if (state?.locked && state.opensAt) {
      throw ApiError.forbidden('Bu kurs hali ochilmagan', 'PATH_ITEM_NOT_YET_OPEN')
    }
    if (state?.locked) {
      throw ApiError.forbidden(
        'Bu kurs oldingi bosqich tugagach ochiladi',
        'PREVIOUS_PATH_ITEM_INCOMPLETE'
      )
    }
  }
}
