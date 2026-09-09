import { EnrollmentRule } from '../../models/enrollmentRule.model.js'
import { User } from '../../models/user.model.js'
import { Group } from '../../models/group.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { pathEnrollmentService } from '../paths/pathEnrollment.service.js'
import { logger } from '../../config/logger.js'

/**
 * Turning rules into assignments.
 *
 * Two properties hold the whole thing up.
 *
 * It only ever *adds*. A rule that stopped matching somebody — they changed
 * department — does not take their courses away: they may be half through
 * one, and revoking training somebody has started is not a decision a
 * background job gets to make. Removing an assignment stays a deliberate,
 * audited act.
 *
 * It is idempotent. The daily sweep re-evaluates every rule against every
 * matching person, so "already assigned" has to be a no-op rather than a
 * duplicate — otherwise a rule quietly builds a pile of assignments with
 * fresh deadlines every morning.
 */

/** Does this person match? Empty arrays mean "no constraint on this field". */
export function matchesRule(user, rule, { groupMemberIds } = {}) {
  const match = rule.match ?? {}

  if (match.roles?.length && !match.roles.includes(user.roleName)) return false
  if (match.departments?.length && !match.departments.includes(user.department ?? '')) return false
  if (match.branches?.length && !match.branches.includes(user.branch ?? '')) return false
  if (match.positions?.length && !match.positions.includes(user.position ?? '')) return false
  if (match.groups?.length) {
    // Group membership lives on the group, not the user, so the caller
    // resolves it once per rule rather than per person.
    if (!groupMemberIds?.has(String(user._id))) return false
  }

  // A rule with nothing in `match` would apply to the entire company. That
  // is occasionally what somebody wants and never what they want by
  // accident, so it has to be stated: an empty match is refused here rather
  // than silently enrolling everybody.
  const hasAnyConstraint = ['roles', 'departments', 'branches', 'positions', 'groups'].some(
    (key) => match[key]?.length
  )
  return hasAnyConstraint
}

/** The set of user ids in any of a rule's groups. */
async function groupMemberIdsFor(rule) {
  if (!rule.match?.groups?.length) return null
  const groups = await Group.find({ _id: { $in: rule.match.groups } }, { memberIds: 1 }).lean()
  return new Set(groups.flatMap((group) => (group.memberIds ?? []).map(String)))
}

function deadlineFor(rule) {
  const days = rule.grant?.deadlineDays ?? 0
  if (!days) return null
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export const enrollmentRuleService = {
  /**
   * Applies one rule to one person.
   *
   * Returns what it actually did, so the daily sweep can report "3 new
   * assignments" rather than "42 people re-checked", which is the number an
   * administrator can act on.
   */
  async applyToUser(rule, user, { groupMemberIds } = {}) {
    if (!matchesRule(user, rule, { groupMemberIds })) return { courses: 0, paths: 0 }

    const deadline = deadlineFor(rule)
    const mandatory = rule.grant?.mandatory !== false
    let courses = 0
    let paths = 0

    for (const courseId of rule.grant?.courseIds ?? []) {
      // Already assigned is a no-op, deadline included: re-stamping it every
      // morning would move a learner's due date forward forever.
      const existing = await courseAssignmentRepository.findByUserAndCourse(user._id, courseId)
      if (existing) continue
      await courseAssignmentRepository.create({
        userId: user._id,
        courseId,
        // Attributed to whoever wrote the rule, not to nobody. They
        // authorised these assignments by creating it and switching it on,
        // and an assignment with no author is one the audit trail cannot
        // explain a year later.
        assignedBy: rule.createdBy,
        mandatory,
        deadline,
      })
      courses += 1
    }

    for (const pathId of rule.grant?.pathIds ?? []) {
      // enroll() upserts, so it is safe to call again — but it would report
      // a new enrolment every night. Checked first so the number the sweep
      // prints is "what changed", not "what exists".
      const existing = await PathEnrollment.exists({ userId: user._id, pathId })
      if (existing) continue
      await pathEnrollmentService.enroll({ id: rule.createdBy }, user._id, pathId, { mandatory, deadline })
      paths += 1
    }

    return { courses, paths }
  },

  /** One rule, against everybody it matches. */
  async applyRule(rule) {
    const groupMemberIds = await groupMemberIdsFor(rule)

    // Narrowed in the query where the field lives on the user, so a rule for
    // one department does not walk the whole staff list.
    // `isActive` is the only "is this person still here" flag the user
    // model has — there is no soft delete on users yet (§1 of the
    // corrections table).
    const filter = { isActive: true }
    if (rule.match?.departments?.length) filter.department = { $in: rule.match.departments }
    if (rule.match?.branches?.length) filter.branch = { $in: rule.match.branches }
    if (rule.match?.positions?.length) filter.position = { $in: rule.match.positions }
    if (groupMemberIds) filter._id = { $in: [...groupMemberIds] }

    const users = await User.find(filter).populate('roleId', 'name').lean()
    let matched = 0
    let courses = 0
    let paths = 0

    for (const row of users) {
      const user = { ...row, roleName: row.roleId?.name ?? '' }
      if (!matchesRule(user, rule, { groupMemberIds })) continue
      matched += 1
      const result = await this.applyToUser(rule, user, { groupMemberIds }).catch((error) => {
        logger.warn('Enrollment rule failed for one person', {
          ruleId: String(rule._id),
          userId: String(user._id),
          error: error.message,
        })
        return { courses: 0, paths: 0 }
      })
      courses += result.courses
      paths += result.paths
    }

    await EnrollmentRule.updateOne(
      { _id: rule._id },
      { $set: { lastEvaluatedAt: new Date(), lastMatchedCount: matched } }
    )

    if (courses || paths) {
      await auditLogRepository.record({
        actor: rule.createdBy,
        action: 'ENROLLMENT_RULE_APPLIED',
        entity: 'EnrollmentRule',
        entityId: String(rule._id),
        metadata: { matched, courses, paths },
      })
    }

    return { matched, courses, paths }
  },

  /** Every active rule — the daily sweep. */
  async applyAll() {
    const rules = await EnrollmentRule.find({ active: true }).lean()
    const totals = { rules: rules.length, matched: 0, courses: 0, paths: 0 }
    for (const rule of rules) {
      const result = await this.applyRule(rule).catch((error) => {
        logger.warn('Enrollment rule sweep failed for one rule', {
          ruleId: String(rule._id),
          error: error.message,
        })
        return { matched: 0, courses: 0, paths: 0 }
      })
      totals.matched += result.matched
      totals.courses += result.courses
      totals.paths += result.paths
    }
    if (totals.courses || totals.paths) logger.info('Enrollment rules applied', totals)
    return totals
  },

  /**
   * Every active rule, against one person.
   *
   * Run when somebody is created or their role, department, branch or
   * position changes — the four things a rule matches on. Waiting for the
   * nightly sweep would mean a new hire spends their first day with an
   * empty course list.
   */
  async applyToOneUser(userId) {
    const row = await User.findById(userId).populate('roleId', 'name').lean()
    if (!row || row.isActive === false) return { courses: 0, paths: 0 }
    const user = { ...row, roleName: row.roleId?.name ?? '' }

    const rules = await EnrollmentRule.find({ active: true }).lean()
    let courses = 0
    let paths = 0
    for (const rule of rules) {
      const groupMemberIds = await groupMemberIdsFor(rule)
      const result = await this.applyToUser(rule, user, { groupMemberIds }).catch(() => ({ courses: 0, paths: 0 }))
      courses += result.courses
      paths += result.paths
    }
    return { courses, paths }
  },

  /**
   * What a rule *would* do, without doing it.
   *
   * The same reason the import wizard has a dry run: a rule that turns out
   * to match four hundred people is a thing to find out before it has
   * assigned them all something.
   */
  async preview(rule) {
    const groupMemberIds = await groupMemberIdsFor(rule)
    const users = await User.find({ isActive: true }).populate('roleId', 'name').lean()
    const matched = users
      .map((row) => ({ ...row, roleName: row.roleId?.name ?? '' }))
      .filter((user) => matchesRule(user, rule, { groupMemberIds }))

    return {
      matchedCount: matched.length,
      // A sample rather than the list: four hundred names is not a preview.
      sample: matched.slice(0, 10).map((user) => ({
        id: String(user._id),
        fullName: user.fullName,
        department: user.department ?? '',
      })),
      grants: (rule.grant?.courseIds?.length ?? 0) + (rule.grant?.pathIds?.length ?? 0),
    }
  },
}
