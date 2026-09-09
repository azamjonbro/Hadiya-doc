import { RecurringAssignment } from '../../models/recurringAssignment.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { Certificate } from '../../models/certificate.model.js'
import { Course } from '../../models/course.model.js'
import { User } from '../../models/user.model.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'
import { logger } from '../../config/logger.js'

/**
 * Recurring training, and the matrix that shows where everybody stands.
 *
 * The cycle is per person, measured from their own completion. A shared
 * company date would mean somebody who finished last week is "due" in
 * January along with everybody else, which is both wrong and the reason
 * compliance spreadsheets get abandoned.
 *
 * The sweep only ever *adds* an assignment. It never marks anybody
 * non-compliant, never removes a certificate and never closes an
 * assignment — the failure mode of an automated compliance system is that
 * it silently decides somebody is out of date, and the person finds out
 * from an auditor.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Matches the audience. Same reading as an enrolment rule (5.3). */
export function matchesAudience(user, match = {}) {
  if (match.roles?.length && !match.roles.includes(user.roleName)) return false
  if (match.departments?.length && !match.departments.includes(user.department ?? '')) return false
  if (match.branches?.length && !match.branches.includes(user.branch ?? '')) return false
  if (match.positions?.length && !match.positions.includes(user.position ?? '')) return false
  // Unlike an enrolment rule, an unconstrained compliance rule is
  // meaningful — "everybody does fire safety" is the usual case.
  return true
}

function addMonths(date, months) {
  const result = new Date(date)
  const day = result.getDate()
  result.setMonth(result.getMonth() + months)
  // 31 January + 1 month is 3 March by default, which would drift a yearly
  // cycle forward by two days every time it passed a short month.
  if (result.getDate() < day) result.setDate(0)
  return result
}

/**
 * When this person's completion runs out.
 *
 * Read from the newest completion of that course — the assignment's
 * `completedAt` if there is one, otherwise a certificate issue date, which
 * covers training completed before the platform tracked assignments.
 */
export function expiryFor(completedAt, intervalMonths) {
  if (!completedAt) return null
  return addMonths(new Date(completedAt), intervalMonths)
}

export const complianceService = {
  /**
   * One rule, one pass.
   *
   * Returns what it did rather than who it looked at: "4 people reassigned"
   * is actionable, "312 checked" is not.
   */
  async runRule(rule, { now = new Date() } = {}) {
    const course = await Course.findById(rule.courseId).lean()
    if (!course) {
      logger.warn('Compliance rule points at a course that no longer exists', { ruleId: String(rule._id) })
      return { matched: 0, reassigned: 0 }
    }

    const filter = { isActive: true }
    if (rule.match?.departments?.length) filter.department = { $in: rule.match.departments }
    if (rule.match?.branches?.length) filter.branch = { $in: rule.match.branches }
    if (rule.match?.positions?.length) filter.position = { $in: rule.match.positions }

    const rows = await User.find(filter).populate('roleId', 'name').lean()
    let matched = 0
    let reassigned = 0

    for (const row of rows) {
      const user = { ...row, roleName: row.roleId?.name ?? '' }
      if (!matchesAudience(user, rule.match)) continue
      matched += 1

      const assignment = await CourseAssignment.findOne({ userId: user._id, courseId: rule.courseId }).lean()

      // Somebody already working on it is left alone. Reassigning would
      // reset their deadline and, worse, look like the platform lost their
      // progress.
      if (assignment && assignment.status === 'ACTIVE') continue

      const completedAt =
        assignment?.completedAt ??
        (
          await Certificate.findOne(
            { userId: user._id, sourceType: 'COURSE', sourceId: rule.courseId, revokedAt: null },
            { issuedAt: 1 }
          )
            .sort({ issuedAt: -1 })
            .lean()
        )?.issuedAt ??
        null

      // Never completed, and never assigned: the rule assigns it for the
      // first time. Never completed but assigned and cancelled is somebody
      // an administrator deliberately took off it — left alone.
      if (!completedAt && assignment) continue

      const expiresAt = expiryFor(completedAt, rule.intervalMonths)
      if (expiresAt && expiresAt > now) continue

      const deadline = new Date(now.getTime() + rule.dueDays * DAY_MS)

      if (assignment) {
        // Reopened rather than duplicated: the unique {userId, courseId}
        // index means there is one row per person per course, and its
        // history is what the matrix reads.
        await CourseAssignment.updateOne(
          { _id: assignment._id },
          { $set: { status: 'ACTIVE', deadline, mandatory: true, completedAt: null } }
        )
      } else {
        await courseAssignmentRepository.create({
          userId: user._id,
          courseId: rule.courseId,
          assignedBy: rule.createdBy,
          mandatory: true,
          deadline,
        })
      }
      reassigned += 1

      await notificationService
        .notify({
          userId: user._id,
          type: 'COMPLIANCE_RETRAINING_DUE',
          vars: {
            courseTitle: course.title,
            deadline: formatNotificationDate(deadline),
            periodLabel: rule.name,
          },
          relatedEntityType: 'Course',
          relatedEntityId: String(rule.courseId),
          severity: 'WARNING',
        })
        .catch((error) => logger.warn('Compliance notice failed', { error: error.message }))
    }

    await RecurringAssignment.updateOne(
      { _id: rule._id },
      {
        $set: {
          lastRunAt: now,
          // The rule is looked at daily; this is the marker the sweep reads
          // so a rule added mid-cycle is not skipped for a year.
          nextRunAt: new Date(now.getTime() + DAY_MS),
        },
      }
    )

    if (reassigned) {
      await auditLogRepository.record({
        actor: rule.createdBy,
        action: 'COMPLIANCE_REASSIGNED',
        entity: 'RecurringAssignment',
        entityId: String(rule._id),
        metadata: { matched, reassigned, courseId: String(rule.courseId) },
      })
    }

    return { matched, reassigned }
  },

  /** Every active rule — the daily sweep. */
  async runAll({ now = new Date() } = {}) {
    const rules = await RecurringAssignment.find({ active: true }).lean()
    const totals = { rules: rules.length, matched: 0, reassigned: 0 }
    for (const rule of rules) {
      const result = await this.runRule(rule, { now }).catch((error) => {
        logger.warn('Compliance rule failed', { ruleId: String(rule._id), error: error.message })
        return { matched: 0, reassigned: 0 }
      })
      totals.matched += result.matched
      totals.reassigned += result.reassigned
    }
    if (totals.reassigned) logger.info('Compliance sweep reassigned training', totals)
    return totals
  },

  /**
   * The course × person matrix.
   *
   * One row per person, one cell per rule, each cell carrying a state and
   * the date behind it. The date matters: "DUE" without "since 3 March" is
   * a red square nobody can act on.
   */
  async matrix({ scopedUserIds = null, now = new Date() } = {}) {
    const rules = await RecurringAssignment.find({ active: true }).lean()
    if (!rules.length) return { courses: [], rows: [] }

    const courses = await Course.find(
      { _id: { $in: rules.map((rule) => rule.courseId) } },
      { title: 1 }
    ).lean()
    const courseById = new Map(courses.map((course) => [String(course._id), course]))

    const userFilter = { isActive: true }
    if (scopedUserIds) userFilter._id = { $in: scopedUserIds }
    const users = await User.find(userFilter, { fullName: 1, department: 1, position: 1 })
      .populate('roleId', 'name')
      .lean()

    const assignments = await CourseAssignment.find({
      userId: { $in: users.map((user) => user._id) },
      courseId: { $in: rules.map((rule) => rule.courseId) },
    }).lean()
    const assignmentKey = (userId, courseId) => `${userId}:${courseId}`
    const assignmentBy = new Map(
      assignments.map((row) => [assignmentKey(row.userId, row.courseId), row])
    )

    const rows = []
    for (const row of users) {
      const user = { ...row, roleName: row.roleId?.name ?? '' }
      const cells = []
      let applies = false

      for (const rule of rules) {
        if (!matchesAudience(user, rule.match)) {
          // Not "compliant" — the rule simply does not apply to them, and
          // painting that green would overstate coverage.
          cells.push({ ruleId: String(rule._id), state: 'NOT_APPLICABLE' })
          continue
        }
        applies = true

        const assignment = assignmentBy.get(assignmentKey(user._id, rule.courseId))
        const completedAt = assignment?.completedAt ?? null
        const expiresAt = expiryFor(completedAt, rule.intervalMonths)

        let state = 'NEVER'
        if (assignment?.status === 'ACTIVE') state = 'DUE'
        else if (expiresAt && expiresAt > now) state = 'VALID'
        else if (completedAt) state = 'EXPIRED'

        cells.push({
          ruleId: String(rule._id),
          state,
          completedAt,
          expiresAt,
          deadline: assignment?.status === 'ACTIVE' ? assignment.deadline : null,
        })
      }

      // Somebody no rule applies to is left off the matrix entirely: a
      // hundred rows of grey squares hide the ones that matter.
      if (applies) {
        rows.push({
          userId: String(user._id),
          fullName: user.fullName,
          department: user.department ?? '',
          cells,
        })
      }
    }

    return {
      courses: rules.map((rule) => ({
        ruleId: String(rule._id),
        courseId: String(rule.courseId),
        title: courseById.get(String(rule.courseId))?.title ?? '(deleted course)',
        intervalMonths: rule.intervalMonths,
      })),
      rows,
    }
  },
}
