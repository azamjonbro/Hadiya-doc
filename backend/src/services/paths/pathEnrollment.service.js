import { LearningPath } from '../../models/learningPath.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { queueCertificate } from '../../jobs/certificateQueue.js'
import { logger } from '../../config/logger.js'
import { User } from '../../models/user.model.js'
import { env } from '../../config/env.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** The administrator's own wording: %TITLE%, %DUE_DATE%, %LINK% filled in. */
export function fillPathText(text, { path, deadline, lang = 'uz' }) {
  const link = `${env.APP_URL ?? ''}/paths/${path._id}`
  return String(text ?? '')
    .replaceAll('%TITLE%', path.title ?? '')
    .replaceAll('%DUE_DATE%', deadline ? formatNotificationDate(deadline, lang) : '—')
    .replaceAll('%LINK%', link)
}
import { computeItemLocks, completedRefIdsFor, orderedItems, summarizeEnrollment } from './pathSequence.js'

/**
 * Where somebody stands on a path, kept up to date as they finish courses.
 *
 * Recomputed from the underlying assignments rather than incremented, for
 * the same reason course completion is (3.1): a counter and the thing it
 * counts drift, and the drift is invisible until somebody's compliance
 * report is wrong. `evaluate` is idempotent and safe to call from anywhere
 * that could have changed the answer.
 */
export const pathEnrollmentService = {
  /**
   * Enrols somebody, and makes sure they can actually take the courses.
   *
   * Enrolling on a path assigns its courses too. Without that, a path is a
   * list of things the learner has no access to — targeting would hide most
   * of them — and the first thing they would do is ask why.
   */
  async enroll(actor, userId, pathId, { mandatory = true, deadline = null, groupId = null } = {}) {
    const path = await LearningPath.findOne({ _id: pathId, deletedAt: null })
    if (!path) return null

    // "Parametry naznacheniya po umolchaniyu": an assigner who names no
    // deadline gets the path's own default, if it has one.
    if (!deadline && path.defaultDeadlineDays > 0) {
      deadline = new Date(Date.now() + path.defaultDeadlineDays * DAY_MS)
    }

    const before = await PathEnrollment.findOne({ userId, pathId }, { _id: 1 }).lean()
    const enrollment = await PathEnrollment.findOneAndUpdate(
      { userId, pathId },
      {
        $setOnInsert: {
          userId,
          pathId,
          assignedBy: actor?.id ?? null,
          groupId,
          mandatory,
          deadline,
          startAt: new Date(),
          status: 'ACTIVE',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    for (const item of orderedItems(path)) {
      if (item.type !== 'COURSE') continue
      // Idempotent: assigning a course somebody already holds leaves the
      // existing assignment — and its progress — alone.
      const existing = await courseAssignmentRepository.findByUserAndCourse(userId, item.refId)
      if (existing) continue
      // BY_DAYS gives each course its own window — opens on `startDay`,
      // due `deadlineDays` later. Otherwise the course carries the path's
      // deadline.
      const startAt = path.orderMode === 'BY_DAYS' && item.startDay ? new Date(Date.now() + item.startDay * DAY_MS) : null
      const itemDeadline = item.deadlineDays
        ? new Date((startAt ?? new Date()).getTime() + item.deadlineDays * DAY_MS)
        : deadline
      await courseAssignmentRepository.create({
        userId,
        courseId: item.refId,
        assignedBy: actor?.id ?? null,
        mandatory: item.required !== false && mandatory,
        deadline: itemDeadline,
        ...(startAt ? { startAt } : {}),
      })
    }

    await this.evaluate(userId, pathId, { notify: false })

    // A new enrolment made by somebody else is announced, unless the
    // builder's "notify on assignment" switch is off. Self-enrolment from
    // the catalogue is not: the learner is the one who just clicked.
    const byOther = actor?.id && String(actor.id) !== String(userId)
    if (!before && byOther && path.notifications?.assign?.enabled !== false) {
      await this.announceAssigned(userId, path, deadline)
    }

    await auditLogRepository.record({
      actor: actor?.id ?? userId,
      action: 'PATH_ENROLLED',
      entity: 'LearningPath',
      entityId: String(pathId),
      metadata: { userId: String(userId), mandatory },
    })

    return PathEnrollment.findById(enrollment._id)
  },

  /**
   * Recomputes one person's standing, and moves the enrolment if it changed.
   *
   * The transition is what triggers the notification and the certificate,
   * not the state — so calling this after every course completion does not
   * congratulate anybody twice.
   */
  async evaluate(userId, pathId, { notify = true } = {}) {
    const [path, enrollment] = await Promise.all([
      LearningPath.findOne({ _id: pathId, deletedAt: null }).lean(),
      PathEnrollment.findOne({ userId, pathId }),
    ])
    if (!path || !enrollment) return null

    const completed = await completedRefIdsFor(userId, path)
    const summary = summarizeEnrollment(path, completed)
    const locks = computeItemLocks(path, completed)
    const done = new Set(completed.map(String))

    enrollment.itemStates = orderedItems(path).map((item) => {
      const id = String(item.refId)
      return {
        refId: item.refId,
        type: item.type,
        status: done.has(id) ? 'COMPLETED' : locks[id]?.locked ? 'LOCKED' : 'AVAILABLE',
        // Preserved rather than restamped, so a completion date does not
        // move every time the enrolment is recomputed.
        completedAt:
          enrollment.itemStates.find((state) => String(state.refId) === id)?.completedAt ??
          (done.has(id) ? new Date() : null),
      }
    })
    enrollment.completionPercent = summary.completionPercent

    const wasComplete = enrollment.status === 'COMPLETED'
    let changed = false

    if (summary.complete && enrollment.status === 'ACTIVE') {
      enrollment.status = 'COMPLETED'
      enrollment.completedAt = new Date()
      changed = true
    } else if (!summary.complete && wasComplete) {
      // A path that grows a new required course is not finished any more —
      // the same rule as AT-04 one level up. A certificate already issued
      // is left alone: it recorded what was true when it was issued.
      enrollment.status = 'ACTIVE'
      enrollment.completedAt = null
      changed = true
    }

    await enrollment.save()

    if (changed && summary.complete) {
      if (notify) {
        await this.announce(userId, path, 'PATH_COMPLETED')
        await this.announceCompletedToAdmins(userId, path)
      }
      if (path.certificateTemplateId) {
        await queueCertificate(userId, path._id, {
          score: `${summary.completionPercent}%`,
          sourceType: 'PATH',
        }).catch((error) => {
          logger.warn('Could not queue the path certificate', {
            pathId: String(path._id),
            userId: String(userId),
            error: error.message,
          })
        })
      }
    }

    return { ...summary, changed, status: enrollment.status }
  },

  /**
   * Re-evaluates every path a finished course appears in.
   *
   * Called from course completion, so finishing the last course of a
   * programme completes the programme in the same request rather than the
   * next time somebody happens to open the page.
   */
  async evaluateForCourse(userId, courseId) {
    const paths = await LearningPath.find(
      { 'items.refId': courseId, deletedAt: null },
      { _id: 1 }
    ).lean()
    for (const path of paths) {
      await this.evaluate(userId, path._id).catch((error) => {
        logger.warn('Path re-evaluation failed', {
          pathId: String(path._id),
          userId: String(userId),
          error: error.message,
        })
      })
    }
  },

  /**
   * PATH_ASSIGNED, in the administrator's wording when they wrote one. The
   * seeded template is the fallback; either way the record is the same
   * type, so the learner's channel preferences apply.
   */
  async announceAssigned(userId, path, deadline) {
    try {
      const custom = path.notifications?.assign ?? {}
      const recipient = await User.findById(userId, { locale: 1 }).lean()
      const lang = recipient?.locale ?? 'uz'
      const subject = custom.subject?.trim() ? fillPathText(custom.subject, { path, deadline, lang }) : undefined
      const text = custom.text?.trim() ? fillPathText(custom.text, { path, deadline, lang }) : undefined
      await notificationService.notify({
        userId,
        type: 'PATH_ASSIGNED',
        title: subject,
        message: text,
        vars: {
          pathTitle: path.title,
          courseCount: String((path.items ?? []).length),
          deadline: deadline ? formatNotificationDate(deadline, lang) : undefined,
        },
        relatedEntityType: 'LearningPath',
        relatedEntityId: String(path._id),
      })
    } catch (error) {
      logger.warn('Path notification failed', { type: 'PATH_ASSIGNED', userId: String(userId), error: error.message })
    }
  },

  /**
   * "Tell the administrators when somebody finishes" — the curator and
   * whoever created the path, without telling the same person twice.
   */
  async announceCompletedToAdmins(userId, path) {
    if (!path.notifications?.completionToAdmins) return
    try {
      const learner = await User.findById(userId, { fullName: 1 }).lean()
      const recipients = [...new Set([path.curatorId, path.createdBy].filter(Boolean).map(String))].filter(
        (id) => id !== String(userId)
      )
      for (const adminId of recipients) {
        await notificationService.notify({
          userId: adminId,
          type: 'PATH_COMPLETED_ADMIN',
          vars: { pathTitle: path.title, learnerName: learner?.fullName ?? '' },
          relatedEntityType: 'LearningPath',
          relatedEntityId: String(path._id),
        })
      }
    } catch (error) {
      logger.warn('Path notification failed', { type: 'PATH_COMPLETED_ADMIN', userId: String(userId), error: error.message })
    }
  },

  /** Best-effort: the status change is the fact, the message about it is not. */
  async announce(userId, path, type) {
    try {
      await notificationService.notify({
        userId,
        type,
        vars: { pathTitle: path.title },
        relatedEntityType: 'LearningPath',
        relatedEntityId: String(path._id),
      })
    } catch (error) {
      logger.warn('Path notification failed', { type, userId: String(userId), error: error.message })
    }
  },
}
