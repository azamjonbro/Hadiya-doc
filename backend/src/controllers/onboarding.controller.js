import { OnboardingProgram } from '../models/onboardingProgram.model.js'
import { OnboardingEnrollment } from '../models/onboardingEnrollment.model.js'
import { onboardingService } from '../services/onboarding/onboarding.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'

export const onboardingController = {
  listPrograms: asyncHandler(async (_req, res) => {
    const items = await OnboardingProgram.find().sort({ createdAt: -1 }).lean()
    sendSuccess(res, { items })
  }),

  createProgram: asyncHandler(async (req, res) => {
    // Created as a draft with autoStart off, whatever was sent. A programme
    // that enrols every new hire the moment it is saved is not something to
    // switch on by accident — the same rule as an enrolment rule.
    const program = await OnboardingProgram.create({
      ...req.body,
      status: 'DRAFT',
      autoStart: false,
      createdBy: req.user.id,
    })
    sendSuccess(res, { program }, 'Program created', 201)
  }),

  updateProgram: asyncHandler(async (req, res) => {
    const program = await OnboardingProgram.findByIdAndUpdate(
      req.params.id,
      { $set: { ...req.body, updatedBy: req.user.id } },
      { new: true, runValidators: true }
    )
    if (!program) throw ApiError.notFound('Program not found')
    sendSuccess(res, { program })
  }),

  deleteProgram: asyncHandler(async (req, res) => {
    const active = await OnboardingEnrollment.countDocuments({ programId: req.params.id, status: 'ACTIVE' })
    if (active > 0) {
      throw ApiError.badRequest(
        `${active} person(s) are part-way through this programme — archive it instead`,
        'PROGRAM_IN_USE'
      )
    }
    const program = await OnboardingProgram.findByIdAndDelete(req.params.id)
    if (!program) throw ApiError.notFound('Program not found')
    sendSuccess(res, { deleted: true })
  }),

  /** Starting somebody by hand, rather than waiting for their hire date. */
  start: asyncHandler(async (req, res) => {
    const { userId, mentorId, startedAt } = req.body
    const enrollment = await onboardingService.start(req.user, userId, req.params.id, { mentorId, startedAt })
    if (!enrollment) throw ApiError.notFound('Program or user not found')
    sendSuccess(res, { enrollment }, 'Onboarding started', 201)
  }),

  /** Everybody on a programme, with how far they are. */
  enrollments: asyncHandler(async (req, res) => {
    const filter = { programId: req.params.id }
    if (req.scopedUserIds) filter.userId = { $in: req.scopedUserIds }
    const rows = await OnboardingEnrollment.find(filter)
      .populate('userId', 'fullName department hireDate')
      .sort({ startedAt: -1 })
      .lean()
    sendSuccess(res, {
      items: rows.map((row) => ({
        id: String(row._id),
        userId: String(row.userId?._id ?? row.userId),
        fullName: row.userId?.fullName ?? '',
        department: row.userId?.department ?? '',
        status: row.status,
        completionPercent: row.completionPercent,
        startedAt: row.startedAt,
        dueAt: row.dueAt,
      })),
    })
  }),

  /** The person's own checklist. */
  mine: asyncHandler(async (req, res) => {
    const rows = await OnboardingEnrollment.find({ userId: req.user.id })
      .populate('programId', 'name description steps')
      .sort({ startedAt: -1 })
      .lean()

    sendSuccess(res, {
      items: rows.map((row) => {
        const steps = [...(row.programId?.steps ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        return {
          id: String(row._id),
          programName: row.programId?.name ?? '',
          status: row.status,
          completionPercent: row.completionPercent,
          dueAt: row.dueAt,
          steps: steps.map((step) => {
            const state = row.stepStates.find((entry) => String(entry.stepId) === String(step._id))
            return {
              id: String(step._id),
              type: step.type,
              refId: step.refId ? String(step.refId) : null,
              title: step.title,
              description: step.description ?? '',
              required: step.required !== false,
              ownerRole: step.ownerRole,
              status: state?.status ?? 'PENDING',
              dueAt: state?.dueAt ?? null,
              completedAt: state?.completedAt ?? null,
              // Whether *this* caller may tick it. A step owned by the
              // manager shows on the new hire's list as somebody else's.
              mine: String(onboardingService.ownerFor(step, row)) === String(req.user.id),
            }
          }),
        }
      }),
    })
  }),

  completeStep: asyncHandler(async (req, res) => {
    sendSuccess(res, await onboardingService.completeStep(req.user, req.params.id, req.params.stepId), 'Step completed')
  }),
}
