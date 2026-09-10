import mongoose from 'mongoose'
import { DevelopmentPlan, DERIVED_GOAL_TYPES } from '../../models/developmentPlan.model.js'
import { PlanReview } from '../../models/planReview.model.js'
import { User } from '../../models/user.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { Course } from '../../models/course.model.js'
import { collectCourseItems, summarize } from '../courses/courseCompletion.service.js'
import { competencyService } from '../competencies/competency.service.js'
import { pointsService } from '../gamification/points.service.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { assertWithinScope } from '../access/actorScope.js'
import { notificationService } from '../notifications/notification.service.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * The individual development plan (13.4).
 *
 * Two decisions carry the whole design:
 *
 * 1. **Progress is read, not typed.** A COURSE goal is worth whatever the
 *    learner's own course progress says, and a COMPETENCY goal is worth the
 *    ratio of the level somebody assessed to the level the goal is aiming
 *    at. Both are recomputed on every read. Only OJT and CUSTOM goals carry
 *    a number a person typed, because nothing in the platform backs them
 *    yet — and `setGoalProgress` refuses outright on the derived kinds
 *    rather than writing a value that would be ignored.
 *
 * 2. **A review freezes an edition.** Approving a plan writes down the
 *    version it approved plus a snapshot of the goals as they read, and a
 *    unique {planId, planVersion} index means a version can be approved
 *    once. Any structural edit afterwards bumps the version, so a later
 *    rewrite produces a new edition to approve rather than silently
 *    inheriting last quarter's signature.
 */

/**
 * CPE credits ride on the existing PointsLedger, as 13.4 requires — there is
 * no second ledger.
 *
 * Two limits of that ledger shape what happens below, and neither is worth
 * editing the shared model for from here:
 *
 *   - `courseId` is required and `source` is one of COMPLETION/QUIZ/
 *     ASSESSMENT, so a credit can only be written against a goal that
 *     points at a real course. `accrue` refuses the other kinds with
 *     CPE_NEEDS_COURSE instead of inventing a courseId.
 *   - the ledger's unique indexes are partial on videoId/assessmentId, so a
 *     row carrying neither has no database-level idempotency at all. The
 *     guard therefore lives on the goal (`cpeCreditedAt`) and is claimed
 *     with a conditional update *before* the ledger write, which is the
 *     same order pointsService itself relies on: claim, then pay.
 */
const CPE_SOURCE = 'COMPLETION'

const DAY_MS = 24 * 60 * 60 * 1000

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** How far along one course-backed goal is, straight from the course itself. */
async function courseProgress(userId, courseId) {
  // A finished assignment is the authoritative answer and costs one small
  // query; recomputing the item list for somebody who already holds the
  // certificate could only disagree with it (a course that gained a lesson
  // after they finished would drag them back below 100).
  const assignment = await CourseAssignment.findOne({ userId, courseId }).select('status completedAt').lean()
  if (assignment?.status === 'COMPLETED') return { percent: 100, completed: true }

  const items = await collectCourseItems(courseId, userId, { publishedOnly: true })
  const { completionPercent } = summarize(items)
  return { percent: clampPercent(completionPercent), completed: false }
}

/**
 * How far along one competency-backed goal is.
 *
 * Measured from where the person actually started, not from zero: somebody
 * asked to go from level 2 to level 4 who is still at 2 has done none of
 * *this* goal, and showing them 50% for standing still is how a plan stops
 * being read. `baseLevel` is the level recorded when the goal was written.
 */
function competencyProgress(goal, item) {
  if (!item) return { percent: 0, current: null, target: goal.targetLevel ?? 0 }
  const target = goal.targetLevel ?? item.required ?? 0
  const current = item.effectiveLevel ?? 0
  if (target <= 0) return { percent: current > 0 ? 100 : 0, current, target }

  const base = Math.min(goal.baseLevel ?? 0, target)
  const span = target - base
  if (span <= 0) return { percent: current >= target ? 100 : 0, current, target }
  return { percent: clampPercent(((current - base) / span) * 100), current, target }
}

/**
 * Attaches derived progress to every goal and rolls the plan up.
 *
 * The competency catalogue is fetched once for the whole plan rather than
 * per goal: `forUser` walks the entire active catalogue, and a plan with
 * four competency goals would otherwise walk it four times.
 */
async function decorate(plan) {
  const needsCompetencies = plan.goals.some((goal) => goal.type === 'COMPETENCY')
  const competencyReport = needsCompetencies
    ? await competencyService.forUser(String(plan.userId)).catch((error) => {
        // A plan must still open when the competency catalogue cannot be
        // read; the goals that depend on it show as unknown rather than
        // taking the page down with them.
        logger.warn('Competency read failed for plan', { planId: String(plan._id), error: error.message })
        return null
      })
    : null
  const itemByCompetency = new Map(
    (competencyReport?.items ?? []).map((item) => [String(item.competencyId), item])
  )

  const goals = []
  for (const goal of plan.goals) {
    const derived = DERIVED_GOAL_TYPES.includes(goal.type)
    let percent = goal.manualProgress ?? 0
    const extra = {}

    if (goal.type === 'COURSE' && goal.courseId) {
      const result = await courseProgress(plan.userId, goal.courseId)
      percent = result.percent
      extra.courseCompleted = result.completed
    } else if (goal.type === 'COMPETENCY' && goal.competencyId) {
      const result = competencyProgress(goal, itemByCompetency.get(String(goal.competencyId)))
      percent = result.percent
      extra.currentLevel = result.current
      extra.targetLevel = result.target
    }

    // The stored status still wins where it is a decision rather than a
    // measurement: a goal somebody dropped is dropped whatever the course
    // progress says, and a manager may sign a goal off early.
    const status =
      goal.status === 'DROPPED' || goal.status === 'ACHIEVED'
        ? goal.status
        : percent >= 100
          ? 'ACHIEVED'
          : percent > 0
            ? 'IN_PROGRESS'
            : 'PLANNED'

    goals.push({
      id: String(goal._id),
      baseLevel: goal.baseLevel ?? 0,
      type: goal.type,
      title: goal.title,
      description: goal.description ?? '',
      courseId: goal.courseId ? String(goal.courseId) : null,
      competencyId: goal.competencyId ? String(goal.competencyId) : null,
      ojtChecklistId: goal.ojtChecklistId ?? null,
      targetDate: goal.targetDate ?? null,
      weight: goal.weight ?? 1,
      status,
      // Says out loud where the number came from, because the front end
      // must not offer a slider on a goal the API will refuse to move.
      progressSource: derived ? 'DERIVED' : 'MANUAL',
      progressPercent: clampPercent(percent),
      overdue: Boolean(goal.targetDate && status !== 'ACHIEVED' && goal.targetDate < new Date()),
      cpeCredits: goal.cpeCredits ?? 0,
      cpeCreditedAt: goal.cpeCreditedAt ?? null,
      achievedAt: goal.achievedAt ?? null,
      ...extra,
    })
  }

  // Weighted, and dropped goals excluded: a goal abandoned in week two must
  // neither drag the plan down nor count as free progress.
  const counted = goals.filter((goal) => goal.status !== 'DROPPED')
  const totalWeight = counted.reduce((sum, goal) => sum + goal.weight, 0)
  const progressPercent = totalWeight
    ? clampPercent(counted.reduce((sum, goal) => sum + goal.progressPercent * goal.weight, 0) / totalWeight)
    : 0

  return {
    id: String(plan._id),
    userId: String(plan.userId),
    managerId: plan.managerId ? String(plan.managerId) : null,
    title: plan.title,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    status: plan.status,
    version: plan.version,
    lockedVersion: plan.lockedVersion ?? null,
    lastReviewAt: plan.lastReviewAt ?? null,
    goals,
    progressPercent,
    goalCount: plan.goals.length,
    achievedCount: goals.filter((goal) => goal.status === 'ACHIEVED').length,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }
}

/** Reading somebody's plan: their own, or one of the caller's own people. */
async function assertReadable(actor, plan) {
  if (String(plan.userId) === String(actor.id)) return
  if (!actor.permissions?.includes('devplan:manage')) {
    throw ApiError.forbidden('This is not your development plan', 'DEVPLAN_NOT_OWN')
  }
  await assertWithinScope(actor, plan.userId, 'This employee is outside your scope', 'DEVPLAN_SCOPE_FORBIDDEN')
}

/** Writing somebody's plan: always a management act, always inside scope. */
async function assertWritable(actor, plan) {
  await assertWithinScope(actor, plan.userId, 'This employee is outside your scope', 'DEVPLAN_SCOPE_FORBIDDEN')
}

function normaliseGoal(goal) {
  return {
    type: goal.type,
    title: goal.title,
    description: goal.description ?? '',
    courseId: goal.type === 'COURSE' ? goal.courseId : null,
    competencyId: goal.type === 'COMPETENCY' ? goal.competencyId : null,
    targetLevel: goal.type === 'COMPETENCY' ? (goal.targetLevel ?? null) : null,
    ojtChecklistId: goal.type === 'OJT' ? (goal.ojtChecklistId ?? null) : null,
    targetDate: goal.targetDate ?? null,
    weight: goal.weight ?? 1,
    cpeCredits: goal.cpeCredits ?? 0,
    manualProgress: DERIVED_GOAL_TYPES.includes(goal.type) ? 0 : (goal.manualProgress ?? 0),
    status: goal.status ?? 'PLANNED',
  }
}

/**
 * A competency goal remembers the level the person was on when it was
 * written, so its progress bar measures the climb rather than the height.
 * Read once at creation; re-reading it later would move the goalposts every
 * time somebody was reassessed.
 */
async function withBaseLevel(userId, goal) {
  if (goal.type !== 'COMPETENCY' || !goal.competencyId) return goal
  const report = await competencyService.forUser(String(userId)).catch(() => null)
  const item = report?.items?.find((entry) => String(entry.competencyId) === String(goal.competencyId))
  return { ...goal, baseLevel: item?.effectiveLevel ?? 0, targetLevel: goal.targetLevel ?? item?.required ?? null }
}

export const developmentPlanService = {
  /** Everybody's plans the caller may see, newest period first. */
  async list(actor, scopedUserIds, { userId, status, page = 1, limit = 25 } = {}) {
    const filter = {}
    if (userId) filter.userId = userId
    if (status) filter.status = status
    // The fence is applied here rather than trusted to the caller, the same
    // rule the competency matrix follows: this is a screen that reads many
    // people at once.
    if (scopedUserIds) {
      filter.userId = userId
        ? { $in: scopedUserIds.filter((id) => id === String(userId)) }
        : { $in: scopedUserIds }
    }

    const [rows, total] = await Promise.all([
      DevelopmentPlan.find(filter)
        .populate('userId', 'fullName department position avatar')
        .sort({ periodStart: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DevelopmentPlan.countDocuments(filter),
    ])

    return {
      total,
      page,
      limit,
      items: rows.map((row) => ({
        id: String(row._id),
        userId: String(row.userId?._id ?? row.userId),
        fullName: row.userId?.fullName ?? '',
        department: row.userId?.department ?? '',
        position: row.userId?.position ?? '',
        title: row.title,
        status: row.status,
        version: row.version,
        lockedVersion: row.lockedVersion ?? null,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        goalCount: row.goals?.length ?? 0,
        lastReviewAt: row.lastReviewAt ?? null,
        // Deliberately not the derived figure: the list would fan out into
        // a course-progress read per goal per row. The real number is on
        // the plan itself, one click away.
        plannedAchieved: (row.goals ?? []).filter((goal) => goal.status === 'ACHIEVED').length,
      })),
    }
  },

  /** The caller's own plans, with live progress. */
  async mine(userId) {
    const rows = await DevelopmentPlan.find({ userId, status: { $ne: 'ARCHIVED' } })
      .sort({ periodStart: -1 })
      .lean()
    return { items: await Promise.all(rows.map((row) => decorate(row))) }
  },

  async getById(actor, id) {
    const plan = await DevelopmentPlan.findById(id).lean()
    if (!plan) throw ApiError.notFound('Development plan not found')
    await assertReadable(actor, plan)

    const [decorated, reviews] = await Promise.all([
      decorate(plan),
      PlanReview.find({ planId: plan._id })
        .populate('reviewerId', 'fullName')
        .sort({ reviewedAt: -1 })
        .lean(),
    ])

    return {
      ...decorated,
      reviews: reviews.map((review) => ({
        id: String(review._id),
        reviewerId: String(review.reviewerId?._id ?? review.reviewerId),
        reviewerName: review.reviewerId?.fullName ?? '',
        planVersion: review.planVersion,
        period: review.period ?? '',
        decision: review.decision,
        overallRating: review.overallRating ?? null,
        comment: review.comment ?? '',
        goalComments: (review.goalComments ?? []).map((entry) => ({ ...entry, goalId: String(entry.goalId) })),
        progressPercent: review.progressPercent ?? 0,
        cpeCreditsAwarded: review.cpeCreditsAwarded ?? 0,
        reviewedAt: review.reviewedAt,
        // The frozen text. What was approved, not what the plan says now.
        snapshot: review.snapshot ?? [],
      })),
    }
  },

  async create(actor, payload) {
    const user = await User.findById(payload.userId).select('fullName managerId').lean()
    if (!user) throw ApiError.notFound('User not found')
    await assertWithinScope(actor, payload.userId, 'This employee is outside your scope', 'DEVPLAN_SCOPE_FORBIDDEN')

    const goals = []
    for (const goal of payload.goals ?? []) {
      goals.push(await withBaseLevel(payload.userId, normaliseGoal(goal)))
    }

    const plan = await DevelopmentPlan.create({
      userId: payload.userId,
      // Whoever is writing the plan owns the review, falling back to the
      // employee's line manager when HR writes it on their behalf.
      managerId: payload.managerId ?? user.managerId ?? actor.id,
      title: payload.title,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      status: payload.status ?? 'DRAFT',
      goals,
      createdBy: actor.id,
    })

    return decorate(plan.toObject())
  },

  /**
   * Header edits. Touching goals goes through the goal calls below, so
   * "what bumped the version" is answerable from one place.
   */
  async update(actor, id, payload) {
    const plan = await DevelopmentPlan.findById(id)
    if (!plan) throw ApiError.notFound('Development plan not found')
    await assertWritable(actor, plan)

    for (const [key, value] of Object.entries(payload)) plan[key] = value
    plan.updatedBy = actor.id
    await plan.save()
    return decorate(plan.toObject())
  },

  async remove(actor, id) {
    const plan = await DevelopmentPlan.findById(id).lean()
    if (!plan) throw ApiError.notFound('Development plan not found')
    await assertWritable(actor, plan)
    if (plan.lockedVersion) {
      // An approved plan is somebody's record of a conversation that
      // happened. Archiving keeps it readable; deleting takes the review
      // with it.
      throw ApiError.badRequest('This plan has been reviewed — archive it instead', 'DEVPLAN_REVIEWED')
    }
    await DevelopmentPlan.deleteOne({ _id: id })
    await PlanReview.deleteMany({ planId: id })
    return { deleted: true }
  },

  /**
   * Adds, edits or drops a goal — and bumps the edition when the plan has
   * already been approved, so the approval keeps referring to the text it
   * actually read.
   */
  async mutateGoals(actor, id, mutate) {
    const plan = await DevelopmentPlan.findById(id)
    if (!plan) throw ApiError.notFound('Development plan not found')
    await assertWritable(actor, plan)

    await mutate(plan)

    if (plan.lockedVersion && plan.lockedVersion >= plan.version) {
      plan.version = plan.lockedVersion + 1
      // Back to being worked on: a changed plan is not a reviewed plan.
      if (plan.status === 'REVIEWED') plan.status = 'ACTIVE'
    }
    plan.updatedBy = actor.id
    await plan.save()
    return decorate(plan.toObject())
  },

  async addGoal(actor, id, payload) {
    return this.mutateGoals(actor, id, async (plan) => {
      plan.goals.push(await withBaseLevel(plan.userId, normaliseGoal(payload)))
    })
  },

  async updateGoal(actor, id, goalId, payload) {
    return this.mutateGoals(actor, id, async (plan) => {
      const goal = plan.goals.id(goalId)
      if (!goal) throw ApiError.notFound('Goal not found')
      // The type is not editable: changing it would leave a course goal
      // carrying a competency's base level, and its progress would be read
      // off the wrong record.
      for (const [key, value] of Object.entries(payload)) {
        if (key === 'type') continue
        goal[key] = value
      }
      if (payload.status === 'ACHIEVED' && !goal.achievedAt) goal.achievedAt = new Date()
    })
  },

  async removeGoal(actor, id, goalId) {
    return this.mutateGoals(actor, id, async (plan) => {
      const goal = plan.goals.id(goalId)
      if (!goal) throw ApiError.notFound('Goal not found')
      goal.deleteOne()
    })
  },

  /**
   * Types a percentage onto a goal.
   *
   * Refused on COURSE and COMPETENCY goals. Those read through to the real
   * record on every load, so a number written here would be overwritten by
   * the next read — and the failure would be silent, which is worse than a
   * refusal: the manager would believe they had recorded something.
   *
   * The plan's owner may move their own manual goals; a manager may move
   * their own people's.
   */
  async setGoalProgress(actor, id, goalId, { progressPercent, status }) {
    const plan = await DevelopmentPlan.findById(id)
    if (!plan) throw ApiError.notFound('Development plan not found')
    await assertReadable(actor, plan)

    const goal = plan.goals.id(goalId)
    if (!goal) throw ApiError.notFound('Goal not found')
    if (DERIVED_GOAL_TYPES.includes(goal.type)) {
      throw ApiError.badRequest(
        `Progress on a ${goal.type} goal is read from the ${goal.type === 'COURSE' ? 'course' : 'competency record'}`,
        'GOAL_PROGRESS_DERIVED'
      )
    }

    if (progressPercent !== undefined) goal.manualProgress = progressPercent
    if (status) goal.status = status
    if ((status === 'ACHIEVED' || progressPercent === 100) && !goal.achievedAt) {
      goal.achievedAt = new Date()
      goal.status = 'ACHIEVED'
    }
    plan.updatedBy = actor.id
    await plan.save()
    return decorate(plan.toObject())
  },

  /**
   * A review: the manager's comments, a decision, and a frozen copy of what
   * they read.
   *
   * The snapshot is taken from the *derived* view, not from the stored
   * goals, so it records the percentages the reviewer actually saw. Reading
   * a review later must not require re-deriving anything.
   */
  async review(actor, id, payload) {
    const plan = await DevelopmentPlan.findById(id)
    if (!plan) throw ApiError.notFound('Development plan not found')
    await assertWritable(actor, plan)
    if (!plan.goals.length) {
      throw ApiError.badRequest('A plan with no goals has nothing to review', 'DEVPLAN_EMPTY')
    }

    const decorated = await decorate(plan.toObject())
    const approving = payload.decision === 'APPROVED'

    let review
    try {
      review = await PlanReview.create({
        planId: plan._id,
        userId: plan.userId,
        reviewerId: actor.id,
        planVersion: plan.version,
        period: payload.period ?? '',
        decision: payload.decision,
        overallRating: payload.overallRating ?? null,
        comment: payload.comment ?? '',
        goalComments: (payload.goalComments ?? []).map((entry) => ({
          goalId: entry.goalId,
          comment: entry.comment ?? '',
          progressPercent:
            entry.progressPercent ??
            decorated.goals.find((goal) => goal.id === String(entry.goalId))?.progressPercent ??
            0,
          status:
            entry.status ??
            decorated.goals.find((goal) => goal.id === String(entry.goalId))?.status ??
            'PLANNED',
        })),
        snapshot: decorated.goals,
        progressPercent: decorated.progressPercent,
      })
    } catch (error) {
      // The unique {planId, planVersion} index on approvals. Approving the
      // same text twice is not a second opinion, it is a double-click.
      if (error.code === 11000) {
        throw ApiError.conflict(
          `Version ${plan.version} of this plan has already been approved`,
          'PLAN_VERSION_LOCKED'
        )
      }
      throw error
    }

    if (approving) {
      plan.lockedVersion = plan.version
      plan.status = payload.completePlan ? 'COMPLETED' : 'REVIEWED'
    }
    plan.lastReviewAt = review.reviewedAt
    plan.updatedBy = actor.id
    await plan.save()

    // Approving a development plan decides who is considered ready for what,
    // so it is written down where an edit cannot reach it.
    await auditLogRepository.record({
      actor: actor.id,
      action: approving ? 'DEVPLAN_APPROVED' : 'DEVPLAN_REVIEWED',
      entity: 'DevelopmentPlan',
      entityId: String(plan._id),
      metadata: {
        userId: String(plan.userId),
        planVersion: review.planVersion,
        decision: review.decision,
        overallRating: review.overallRating ?? null,
        progressPercent: review.progressPercent,
        goalCount: plan.goals.length,
      },
    })

    let credited = { creditedGoals: [], totalCredits: 0 }
    if (approving) {
      credited = await this.accrue(actor, id, { reviewId: review._id })
      if (credited.totalCredits > 0) {
        await PlanReview.updateOne({ _id: review._id }, { $set: { cpeCreditsAwarded: credited.totalCredits } })
      }
    }

    await notificationService
      .notify({
        userId: plan.userId,
        type: approving ? 'DEVPLAN_APPROVED' : 'DEVPLAN_REVIEWED',
        vars: { planTitle: plan.title, decision: review.decision },
        relatedEntityType: 'DevelopmentPlan',
        relatedEntityId: String(plan._id),
      })
      // Best-effort, as everywhere else: failing to send the note must not
      // undo a review that is already written down.
      .catch((error) => logger.warn('Development plan notice failed', { error: error.message }))

    return { review: { id: String(review._id), ...review.toObject() }, credited }
  },

  /**
   * Pays out CPE credits for every achieved goal that has not been paid.
   *
   * Idempotent by construction: the claim is a conditional update matching
   * the goal *and* an unclaimed `cpeCreditedAt`, so two concurrent calls see
   * one `modifiedCount: 1` and one `0`. The ledger write happens only for
   * the winner, and the claim is released if it fails — an unpaid credit is
   * recoverable, a phantom one is not.
   */
  async accrue(actor, id, { reviewId = null } = {}) {
    const plan = await DevelopmentPlan.findById(id).lean()
    if (!plan) throw ApiError.notFound('Development plan not found')
    await assertWritable(actor, plan)

    const decorated = await decorate(plan)
    const creditedGoals = []
    let totalCredits = 0

    for (const goal of decorated.goals) {
      if (!goal.cpeCredits || goal.cpeCreditedAt) continue
      if (goal.status !== 'ACHIEVED') continue
      if (!goal.courseId) {
        // See CPE_SOURCE above: PointsLedger requires a courseId, so a
        // credit with nothing to attribute it to cannot be written. Skipped
        // rather than thrown, so one unattributable goal does not block the
        // rest of an approval's credits.
        logger.warn('CPE credit skipped — goal has no course to attribute it to', {
          planId: String(plan._id),
          goalId: goal.id,
        })
        continue
      }

      const claim = await DevelopmentPlan.updateOne(
        {
          _id: plan._id,
          // $elemMatch, not two dotted paths: `goals._id` and
          // `goals.cpeCreditedAt` as separate keys match when *some* goal
          // has the id and *some* goal is unclaimed — which is nearly
          // always true, and would pay every goal twice.
          goals: { $elemMatch: { _id: new mongoose.Types.ObjectId(goal.id), cpeCreditedAt: null } },
        },
        { $set: { 'goals.$.cpeCreditedAt': new Date() } }
      )
      if (claim.modifiedCount !== 1) continue

      try {
        // Through the existing service, not a direct ledger insert: badge
        // evaluation hangs off it, and a credit that never re-evaluates
        // badges is a credit that silently does not count toward one.
        await pointsService.award(plan.userId, null, goal.courseId, goal.cpeCredits, CPE_SOURCE)
      } catch (error) {
        // Release the claim so the next approval can retry. Leaving it set
        // would lose the credit permanently, with nothing anywhere saying so.
        await DevelopmentPlan.updateOne(
          { _id: plan._id, 'goals._id': goal.id },
          { $set: { 'goals.$.cpeCreditedAt': null } }
        )
        throw error
      }

      creditedGoals.push({ goalId: goal.id, credits: goal.cpeCredits })
      totalCredits += goal.cpeCredits
    }

    if (creditedGoals.length) {
      await auditLogRepository.record({
        actor: actor.id,
        action: 'DEVPLAN_CPE_CREDITED',
        entity: 'DevelopmentPlan',
        entityId: String(plan._id),
        metadata: {
          userId: String(plan.userId),
          reviewId: reviewId ? String(reviewId) : null,
          totalCredits,
          goals: creditedGoals.length,
        },
      })
    }

    return { creditedGoals, totalCredits }
  },

  /**
   * "What should this person work on?" — the gaps, straight from 13.1.
   *
   * Calls the competency service rather than reimplementing the arithmetic,
   * so the bar a plan is written against is the same bar the matrix and the
   * "below the bar" report use. Each suggestion carries the courses the
   * competency already nominates, which is what turns a gap into a goal
   * with one click.
   */
  async suggestions(actor, userId) {
    await assertWithinScope(actor, userId, 'This employee is outside your scope', 'DEVPLAN_SCOPE_FORBIDDEN')
    const report = await competencyService.forUser(String(userId), { includeUnrequired: false })

    const gaps = report.items.filter((item) => item.gap > 0)
    const courseIds = [...new Set(gaps.flatMap((item) => item.developmentCourseIds))]
    const courses = courseIds.length
      ? await Course.find({ _id: { $in: courseIds } }).select('title').lean()
      : []
    const titleById = new Map(courses.map((course) => [String(course._id), course.title]))

    return {
      user: report.user,
      fitPercent: report.fitPercent,
      items: gaps.map((item) => ({
        competencyId: item.competencyId,
        code: item.code,
        name: item.name,
        category: item.category,
        currentLevel: item.effectiveLevel,
        requiredLevel: item.required,
        gap: item.gap,
        status: item.status,
        courses: item.developmentCourseIds.map((courseId) => ({
          id: courseId,
          title: titleById.get(courseId) ?? '',
        })),
      })),
    }
  },

  /** Every plan whose period is closing, for whoever chases reviews. */
  async dueForReview(scopedUserIds, { withinDays = 14 } = {}) {
    const filter = {
      status: { $in: ['ACTIVE', 'DRAFT'] },
      periodEnd: { $lte: new Date(Date.now() + withinDays * DAY_MS) },
    }
    if (scopedUserIds) filter.userId = { $in: scopedUserIds }
    const rows = await DevelopmentPlan.find(filter)
      .populate('userId', 'fullName department')
      .sort({ periodEnd: 1 })
      .limit(100)
      .lean()
    return {
      items: rows.map((row) => ({
        id: String(row._id),
        userId: String(row.userId?._id ?? row.userId),
        fullName: row.userId?.fullName ?? '',
        title: row.title,
        periodEnd: row.periodEnd,
        status: row.status,
      })),
    }
  },
}

export { decorate as decoratePlan, competencyProgress }
