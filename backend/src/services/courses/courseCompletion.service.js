import { videoRepository } from '../../repositories/video.repository.js'
import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { materialRepository } from '../../repositories/material.repository.js'
import { materialProgressRepository } from '../../repositories/materialProgress.repository.js'
import { assessmentRepository } from '../../repositories/assessment.repository.js'
import { assessmentAttemptRepository } from '../../repositories/assessmentAttempt.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { logger } from '../../config/logger.js'
import { queueCertificate } from '../../jobs/certificateQueue.js'
import { pathEnrollmentService } from '../paths/pathEnrollment.service.js'
import { queueOnboardingEvaluation } from '../../jobs/onboardingQueue.js'

/**
 * One definition of "this course is finished", and one place that acts on it.
 *
 * Before 3.1 there were two, and they disagreed:
 *
 *   - `videoEventProcessor` decided completion from videos alone, behind a
 *     `publishedVideoIds.length > 0` guard. A course made of a presentation
 *     and a test therefore never finished — there were no videos to complete,
 *     so the condition was never even evaluated (AT-01).
 *   - `course.service` computed a percentage across videos, materials *and*
 *     assessments for the progress endpoint.
 *
 * So a learner could see 60% and hold a COMPLETED assignment, or 100% and
 * hold an ACTIVE one, and a failed mandatory test did not stop either
 * (AT-02). The percentage and the status now come from the same call, which
 * is what makes AT-03 true by construction rather than by agreement.
 */

const DEFAULT_RULE = { minPercent: 100, requireAllRequired: true }

/**
 * Every item in a course, with how far this person has got through each.
 *
 * `publishedOnly` is the learner's view. Staff previewing a course see draft
 * items too, but completion is always judged on the published set: a learner
 * cannot be held back by a lesson nobody has released.
 */
export async function collectCourseItems(courseId, userId, { publishedOnly = true } = {}) {
  const [videos, videoRows, materials, materialRows, assessments, attempts] = await Promise.all([
    videoRepository.listByCourse(courseId),
    videoProgressRepository.listByUserAndCourse(userId, courseId),
    materialRepository.listByCourse(courseId),
    materialProgressRepository.listByUserAndCourse(userId, courseId),
    assessmentRepository.listByCourse(courseId),
    assessmentAttemptRepository.listByUserAndCourse(userId, courseId),
  ])

  const visible = (rows) => (publishedOnly ? rows.filter((row) => row.status === 'PUBLISHED') : rows)
  const videoRowById = new Map(videoRows.map((row) => [row.videoId.toString(), row]))
  const materialRowById = new Map(materialRows.map((row) => [row.materialId.toString(), row]))
  // A test is done when it has been *passed*. An attempt that failed is a
  // try, not a completion, and counting it would let a course reach 100%
  // with nothing learned.
  const passedAssessmentIds = new Set(
    attempts.filter((attempt) => attempt.passed).map((attempt) => attempt.assessmentId.toString())
  )

  const items = []

  for (const video of visible(videos)) {
    const row = videoRowById.get(video._id.toString())
    items.push({
      kind: 'video',
      id: video._id.toString(),
      title: video.title,
      // Videos and tests are all-or-nothing: completing one already meant
      // exactly that, and a half-watched video teaches half of nothing.
      share: row?.completedAt ? 1 : 0,
      completed: Boolean(row?.completedAt),
      completionPercent: row?.completionPercent ?? 0,
      required: video.required !== false,
    })
  }

  for (const material of visible(materials)) {
    const row = materialRowById.get(material._id.toString())
    items.push({
      kind: 'material',
      id: material._id.toString(),
      title: material.title,
      // A document contributes the fraction of its pages actually read: two
      // slides of a hundred is 2% of that item, not nothing and not all.
      share: (row?.completionPercent ?? 0) / 100,
      completed: Boolean(row?.completedAt),
      completionPercent: row?.completionPercent ?? 0,
      viewedPages: row?.viewedPages?.length ?? 0,
      totalPages: row?.totalPages ?? 0,
      // Materials carry no `required` flag yet, so every published one
      // counts. When they gain one (Blok 9) this is the line that changes.
      required: true,
    })
  }

  for (const assessment of visible(assessments)) {
    const passed = passedAssessmentIds.has(assessment._id.toString())
    items.push({
      kind: 'assessment',
      id: assessment._id.toString(),
      title: assessment.title,
      share: passed ? 1 : 0,
      completed: passed,
      completionPercent: passed ? 100 : 0,
      required: true,
    })
  }

  return items
}

/** The percentage, from the items. Kept separate so both callers use it. */
export function summarize(items) {
  const earned = items.reduce((sum, item) => sum + item.share, 0)
  return {
    completionPercent: items.length ? Math.round((earned / items.length) * 100) : 0,
    completedItems: items.filter((item) => item.share >= 1).length,
    totalItems: items.length,
  }
}

/**
 * Whether the rule is satisfied.
 *
 * A course with no published items is *not* complete. It is an empty course,
 * and calling that finished would hand out a certificate for nothing — the
 * opposite mistake to the one AT-01 is about, and just as wrong.
 */
export function meetsRule(items, rule = DEFAULT_RULE) {
  if (!items.length) return false
  const { completionPercent } = summarize(items)
  const minPercent = rule?.minPercent ?? DEFAULT_RULE.minPercent
  const requireAllRequired = rule?.requireAllRequired ?? DEFAULT_RULE.requireAllRequired

  if (completionPercent < minPercent) return false
  if (requireAllRequired && items.some((item) => item.required && !item.completed)) return false
  return true
}

export const courseCompletionService = {
  /**
   * Recomputes where this person stands, and moves the assignment if the
   * answer changed.
   *
   * Called after anything that could change it — a video finishing, a
   * document being read, a test being graded, a lesson being added to the
   * course. Idempotent: calling it twice does not send two notifications,
   * because the transition, not the state, is what triggers one.
   */
  async evaluate(userId, courseId, { notify = true } = {}) {
    const course = await courseRepository.findById(String(courseId))
    if (!course) return null

    const items = await collectCourseItems(courseId, userId, { publishedOnly: true })
    const summary = summarize(items)
    const complete = meetsRule(items, course.completionRule)

    const assignment = await courseAssignmentRepository.findByUserAndCourse(userId, courseId)
    // No assignment means nobody asked this person to take the course. They
    // may still watch it; there is simply no status to move.
    if (!assignment) return { ...summary, complete, changed: false }

    const wasComplete = assignment.status === 'COMPLETED'
    let changed = false

    if (complete && assignment.status === 'ACTIVE') {
      await courseAssignmentRepository.updateById(assignment._id, {
        status: 'COMPLETED',
        completedAt: new Date(),
      })
      changed = true
      if (notify) {
        await this.announce(userId, course, 'COURSE_COMPLETED', {
          courseTitle: course.title,
          score: `${summary.completionPercent}%`,
        })
      }
      // Queued on the transition, so finishing a course once queues one job.
      // A course with no template configured is filtered out by the worker
      // rather than here — that keeps "does this course certify" in one
      // place instead of two.
      await queueCertificate(userId, course._id, { score: `${summary.completionPercent}%` }).catch((error) => {
        logger.warn('Could not queue the certificate', {
          userId: String(userId),
          courseId: String(course._id),
          error: error.message,
        })
      })
    } else if (!complete && wasComplete) {
      // AT-04: a course that grows a new required lesson is not finished any
      // more. The assignment reopens and the learner is told why — silently
      // flipping it back would look like the platform lost their progress.
      //
      // A certificate already issued is deliberately left alone: it recorded
      // what was true when it was issued, and revoking it retroactively for
      // a change the learner had no part in would be dishonest. Finishing
      // again issues a new one.
      await courseAssignmentRepository.updateById(assignment._id, {
        status: 'ACTIVE',
        completedAt: null,
      })
      changed = true
      if (notify) {
        await this.announce(userId, course, 'COURSE_REOPENED', {
          courseTitle: course.title,
          completionPercent: `${summary.completionPercent}%`,
        })
      }
    }

    // A course is often a step in a programme. Re-evaluating here means
    // finishing the last course of a path completes the path in the same
    // request, rather than the next time somebody opens the page.
    if (changed) {
      await pathEnrollmentService.evaluateForCourse(userId, course._id).catch((error) => {
        logger.warn('Could not re-evaluate the paths containing this course', {
          courseId: String(course._id),
          userId: String(userId),
          error: error.message,
        })
      })

      // A course can also be a step in somebody's first week. Queued rather
      // than run here — it reads every programme they are on, and the
      // learner finishing a video should not wait for that.
      await queueOnboardingEvaluation(userId).catch((error) => {
        logger.warn('Could not queue the onboarding evaluation', {
          userId: String(userId),
          error: error.message,
        })
      })
    }

    return { ...summary, complete, changed, status: complete ? 'COMPLETED' : 'ACTIVE' }
  },

  /**
   * Re-evaluates everyone assigned to a course.
   *
   * For the other direction of AT-04: publishing a new required lesson
   * changes the answer for every learner at once, and none of them is making
   * a request at that moment.
   */
  async evaluateCourse(courseId) {
    const assignments = await courseAssignmentRepository.listByCourse(String(courseId))
    let reopened = 0
    let completed = 0
    for (const assignment of assignments) {
      // Sequential: this runs on a course edit, not on a request, and a
      // hundred parallel evaluations would be a hundred parallel reads of
      // the same course.
      const result = await this.evaluate(assignment.userId, courseId).catch((error) => {
        logger.warn('Completion re-evaluation failed for one learner', {
          courseId: String(courseId),
          userId: String(assignment.userId),
          error: error.message,
        })
        return null
      })
      if (!result?.changed) continue
      if (result.complete) completed += 1
      else reopened += 1
    }
    if (reopened || completed) {
      logger.info('Course completion re-evaluated', { courseId: String(courseId), reopened, completed })
    }
    return { reopened, completed }
  },

  /** Best-effort: the status change is the fact, the message about it is not. */
  async announce(userId, course, type, vars) {
    try {
      await notificationService.notify({
        userId,
        type,
        vars,
        relatedEntityType: 'Course',
        relatedEntityId: String(course._id),
        severity: type === 'COURSE_REOPENED' ? 'WARNING' : 'INFO',
      })
    } catch (error) {
      logger.warn('Course completion notification failed', {
        type,
        userId: String(userId),
        error: error.message,
      })
    }
  },
}
