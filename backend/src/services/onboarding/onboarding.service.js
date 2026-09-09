import { OnboardingProgram } from '../../models/onboardingProgram.model.js'
import { OnboardingEnrollment } from '../../models/onboardingEnrollment.model.js'
import { Task } from '../../models/task.model.js'
import { User } from '../../models/user.model.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { pathEnrollmentService } from '../paths/pathEnrollment.service.js'
import { notificationService } from '../notifications/notification.service.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Starting and tracking a new hire's first weeks.
 *
 * The step types differ in what "done" means, and that is the whole design:
 *
 *   COURSE / PATH   completed when the assignment is, so the learner's
 *                   ordinary progress ticks the checklist off — nobody has
 *                   to remember to come back and mark it
 *   TASK            a real Task document, using the same fan-out fields a
 *                   broadcast uses (audienceType, batchId), so it appears
 *                   in the person's task list with its own deadline and
 *                   reminders rather than as a second kind of to-do
 *   MANUAL          a checkbox somebody ticks, because "collect your
 *                   laptop" has nothing in the database to point at
 *
 * Ownership matters more than it looks: the new hire cannot mark "IT
 * account created" done. Letting them is how a checklist becomes fiction.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Does this person match the programme's audience? */
export function matchesProgram(user, program) {
  if (program.targetRoles?.length && !program.targetRoles.includes(user.roleName)) return false
  if (program.departments?.length && !program.departments.includes(user.department ?? '')) return false
  if (program.positions?.length && !program.positions.includes(user.position ?? '')) return false
  if (program.branches?.length && !program.branches.includes(user.branch ?? '')) return false
  // Unlike an enrolment rule, an unconstrained onboarding programme is
  // meaningful — "everybody who joins" is the common case — so an empty
  // audience is allowed here.
  return true
}

function orderedSteps(program) {
  return [...(program.steps ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export const onboardingService = {
  /**
   * Starts a programme for one person.
   *
   * Idempotent on the unique {userId, programId}: the daily job re-checks
   * everybody whose hireDate has arrived, and a second start would give one
   * new hire two checklists.
   */
  async start(actor, userId, programId, { startedAt = new Date(), mentorId = null } = {}) {
    const [program, user] = await Promise.all([
      OnboardingProgram.findById(programId).lean(),
      User.findById(userId).populate('roleId', 'name').lean(),
    ])
    if (!program || !user) return null

    const existing = await OnboardingEnrollment.findOne({ userId, programId })
    if (existing) return existing

    const steps = orderedSteps(program)
    const stepStates = steps.map((step) => ({
      stepId: step._id,
      status: 'PENDING',
      // Stamped once, from the start date. Recomputing on read would move
      // every deadline whenever the programme was edited — including for
      // people who finished months ago.
      dueAt: new Date(startedAt.getTime() + (step.dueDays ?? 0) * DAY_MS),
      completedAt: null,
      completedBy: null,
      taskId: null,
    }))

    const enrollment = await OnboardingEnrollment.create({
      userId,
      programId,
      mentorId,
      // Copied, not joined: whoever owns this checklist is the manager they
      // had on day one, and a reorganisation in week three must not orphan it.
      managerId: user.managerId ?? null,
      startedAt,
      dueAt: stepStates.length
        ? new Date(Math.max(...stepStates.map((state) => state.dueAt.getTime())))
        : null,
      stepStates,
    })

    await this.materialise(program, enrollment, { actorId: actor?.id ?? null })
    await this.evaluate(userId, programId, { notify: false })

    await auditLogRepository.record({
      actor: actor?.id ?? userId,
      action: 'ONBOARDING_STARTED',
      entity: 'OnboardingProgram',
      entityId: String(programId),
      metadata: { userId: String(userId), steps: steps.length },
    })

    await notificationService
      .notify({
        userId,
        type: 'ONBOARDING_STARTED',
        vars: { programName: program.name, stepCount: String(steps.length) },
        relatedEntityType: 'OnboardingProgram',
        relatedEntityId: String(programId),
      })
      .catch((error) => logger.warn('Onboarding notice failed', { error: error.message }))

    return OnboardingEnrollment.findById(enrollment._id)
  },

  /**
   * Creates the real records a programme's steps refer to.
   *
   * A step is a plan; this is what the new hire actually sees. Course and
   * path steps become assignments, task steps become Task documents that
   * land in their task list with their own deadline and reminders.
   */
  async materialise(program, enrollment, { actorId = null } = {}) {
    const assigner = actorId ?? enrollment.managerId ?? program.createdBy
    // One batch id for everything this start created, exactly as a
    // broadcast does — so "what did this onboarding produce" is one query.
    const batchId = enrollment._id

    for (const step of orderedSteps(program)) {
      const state = enrollment.stepStates.find((entry) => String(entry.stepId) === String(step._id))
      if (!state) continue
      const deadline = state.dueAt

      try {
        if (step.type === 'COURSE' && step.refId) {
          const existing = await courseAssignmentRepository.findByUserAndCourse(enrollment.userId, step.refId)
          if (!existing) {
            await courseAssignmentRepository.create({
              userId: enrollment.userId,
              courseId: step.refId,
              assignedBy: assigner,
              mandatory: step.required !== false,
              deadline,
            })
          }
        } else if (step.type === 'PATH' && step.refId) {
          await pathEnrollmentService.enroll({ id: assigner }, enrollment.userId, step.refId, {
            mandatory: step.required !== false,
            deadline,
          })
        } else if (step.type === 'TASK') {
          const task = await Task.create({
            title: step.title,
            description: step.description ?? '',
            // A step owned by somebody else is their task, not the new
            // hire's — the checklist shows it either way, but the person
            // who has to act is the one who gets it in their list.
            assignedTo: this.ownerFor(step, enrollment),
            assignedBy: assigner,
            deadline,
            audienceType: 'USER',
            batchId,
          })
          state.taskId = task._id
        }
      } catch (error) {
        // One step that cannot be created must not abandon the rest of
        // somebody's first week.
        logger.warn('Could not materialise an onboarding step', {
          programId: String(program._id),
          stepId: String(step._id),
          error: error.message,
        })
      }
    }

    await enrollment.save()
  },

  /** Who acts on this step. */
  ownerFor(step, enrollment) {
    switch (step.ownerRole) {
      case 'MANAGER':
        return enrollment.managerId ?? enrollment.userId
      case 'MENTOR':
        return enrollment.mentorId ?? enrollment.managerId ?? enrollment.userId
      case 'HR':
        // No HR inbox yet, so it falls to the manager rather than to the new
        // hire — the wrong person with authority beats the wrong person
        // without it.
        return enrollment.managerId ?? enrollment.userId
      case 'EMPLOYEE':
      default:
        return enrollment.userId
    }
  },

  /**
   * Recomputes one person's standing.
   *
   * Course and task steps are read from the records they created rather
   * than trusted from the checklist, for the same reason course completion
   * is recomputed (3.1): a copy and the thing it copies drift, and the
   * drift is invisible until somebody's first-week report is wrong.
   */
  async evaluate(userId, programId, { notify = true } = {}) {
    const [program, enrollment] = await Promise.all([
      OnboardingProgram.findById(programId).lean(),
      OnboardingEnrollment.findOne({ userId, programId }),
    ])
    if (!program || !enrollment) return null

    const steps = orderedSteps(program)
    const assignments = await courseAssignmentRepository.listByUser(String(userId))
    const completedCourseIds = new Set(
      assignments
        .filter((assignment) => assignment.status === 'COMPLETED')
        .map((assignment) => String(assignment.courseId))
    )

    const taskIds = enrollment.stepStates.map((state) => state.taskId).filter(Boolean)
    const tasks = taskIds.length ? await Task.find({ _id: { $in: taskIds } }, { status: 1 }).lean() : []
    const taskStatusById = new Map(tasks.map((task) => [String(task._id), task.status]))

    for (const step of steps) {
      const state = enrollment.stepStates.find((entry) => String(entry.stepId) === String(step._id))
      if (!state || state.status === 'COMPLETED' || state.status === 'SKIPPED') continue

      let done = false
      if (step.type === 'COURSE' && step.refId) done = completedCourseIds.has(String(step.refId))
      else if (step.type === 'TASK' && state.taskId) done = taskStatusById.get(String(state.taskId)) === 'COMPLETED'
      // PATH steps are ticked by the path's own completion, MANUAL ones by
      // a person — neither is derivable here.

      if (done) {
        state.status = 'COMPLETED'
        state.completedAt = new Date()
      }
    }

    const required = steps.filter((step) => step.required !== false)
    const doneRequired = required.filter((step) => {
      const state = enrollment.stepStates.find((entry) => String(entry.stepId) === String(step._id))
      return state?.status === 'COMPLETED' || state?.status === 'SKIPPED'
    }).length

    enrollment.completionPercent = required.length ? Math.round((doneRequired / required.length) * 100) : 0

    const complete = required.length > 0 && doneRequired === required.length
    let changed = false
    if (complete && enrollment.status === 'ACTIVE') {
      enrollment.status = 'COMPLETED'
      enrollment.completedAt = new Date()
      changed = true
    }
    await enrollment.save()

    if (changed && notify) {
      await notificationService
        .notify({
          userId,
          type: 'ONBOARDING_COMPLETED',
          vars: { programName: program.name },
          relatedEntityType: 'OnboardingProgram',
          relatedEntityId: String(programId),
        })
        .catch((error) => logger.warn('Onboarding completion notice failed', { error: error.message }))
    }

    return { completionPercent: enrollment.completionPercent, complete, changed, status: enrollment.status }
  },

  /** A person ticking a MANUAL step, or an owner ticking theirs. */
  async completeStep(actor, enrollmentId, stepId) {
    const enrollment = await OnboardingEnrollment.findById(enrollmentId)
    if (!enrollment) throw ApiError.notFound('Onboarding not found')

    const program = await OnboardingProgram.findById(enrollment.programId).lean()
    const step = (program?.steps ?? []).find((entry) => String(entry._id) === String(stepId))
    if (!step) throw ApiError.notFound('Step not found')

    const owner = this.ownerFor(step, enrollment)
    const isOwner = String(owner) === String(actor.id)
    const canOverride = actor.permissions?.includes('user:update')
    // The new hire cannot tick a step somebody else is responsible for.
    // That is the difference between a checklist and a wish.
    if (!isOwner && !canOverride) throw ApiError.forbidden('This step is not yours to complete', 'NOT_STEP_OWNER')

    const state = enrollment.stepStates.find((entry) => String(entry.stepId) === String(stepId))
    if (!state) throw ApiError.notFound('Step not found')
    if (state.status !== 'COMPLETED') {
      state.status = 'COMPLETED'
      state.completedAt = new Date()
      state.completedBy = actor.id
      await enrollment.save()
    }

    return this.evaluate(enrollment.userId, enrollment.programId)
  },

  /**
   * Starts every programme whose new hires have arrived.
   *
   * Run daily. `hireDate` is a date somebody typed in weeks earlier, so
   * "has it arrived" is the only question — a person hired last month who
   * was created today still gets their onboarding.
   */
  async autoStartDue({ now = new Date() } = {}) {
    const programs = await OnboardingProgram.find({ status: 'ACTIVE', autoStart: true }).lean()
    const totals = { programs: programs.length, started: 0 }
    if (!programs.length) return totals

    const users = await User.find({
      isActive: true,
      hireDate: { $ne: null, $lte: now },
    })
      .populate('roleId', 'name')
      .lean()

    for (const program of programs) {
      for (const row of users) {
        const user = { ...row, roleName: row.roleId?.name ?? '' }
        if (!matchesProgram(user, program)) continue
        const existing = await OnboardingEnrollment.exists({ userId: user._id, programId: program._id })
        if (existing) continue
        const started = await this.start(null, user._id, program._id, {
          // From their hire date, not from today: somebody entered a week
          // late should not get a week longer to finish.
          startedAt: new Date(user.hireDate),
        }).catch((error) => {
          logger.warn('Could not start onboarding', {
            programId: String(program._id),
            userId: String(user._id),
            error: error.message,
          })
          return null
        })
        if (started) totals.started += 1
      }
    }

    if (totals.started) logger.info('Onboarding programmes started', totals)
    return totals
  },
}
