import { RecurringAssignment } from '../models/recurringAssignment.model.js'
import { complianceService } from '../services/compliance/compliance.service.js'
import { auditLogRepository } from '../repositories/auditLog.repository.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'

export const complianceController = {
  list: asyncHandler(async (_req, res) => {
    const items = await RecurringAssignment.find().populate('courseId', 'title').sort({ createdAt: -1 }).lean()
    sendSuccess(res, {
      items: items.map((rule) => ({
        id: String(rule._id),
        name: rule.name,
        courseId: String(rule.courseId?._id ?? rule.courseId),
        courseTitle: rule.courseId?.title ?? '',
        match: rule.match ?? {},
        intervalMonths: rule.intervalMonths,
        dueDays: rule.dueDays,
        active: rule.active,
        lastRunAt: rule.lastRunAt,
      })),
    })
  }),

  create: asyncHandler(async (req, res) => {
    // Inactive on creation, whatever was sent. A rule that reassigns
    // mandatory training to hundreds of people the moment it is saved is
    // not something to switch on by accident — the same rule as an
    // enrolment rule and an onboarding programme.
    const rule = await RecurringAssignment.create({ ...req.body, active: false, createdBy: req.user.id })
    sendSuccess(res, { rule }, 'Rule created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    const rule = await RecurringAssignment.findByIdAndUpdate(
      req.params.id,
      { $set: { ...req.body, updatedBy: req.user.id } },
      { new: true, runValidators: true }
    )
    if (!rule) throw ApiError.notFound('Rule not found')
    sendSuccess(res, { rule })
  }),

  remove: asyncHandler(async (req, res) => {
    const rule = await RecurringAssignment.findByIdAndDelete(req.params.id)
    if (!rule) throw ApiError.notFound('Rule not found')
    // Assignments it already made stay: people are part-way through them,
    // and deleting a rule is not a decision to cancel training.
    await auditLogRepository.record({
      actor: req.user.id,
      action: 'COMPLIANCE_RULE_DELETED',
      entity: 'RecurringAssignment',
      entityId: String(req.params.id),
      metadata: { name: rule.name },
    })
    sendSuccess(res, { deleted: true })
  }),

  run: asyncHandler(async (req, res) => {
    const rule = await RecurringAssignment.findById(req.params.id).lean()
    if (!rule) throw ApiError.notFound('Rule not found')
    sendSuccess(res, await complianceService.runRule(rule), 'Rule applied')
  }),

  matrix: asyncHandler(async (req, res) => {
    sendSuccess(res, await complianceService.matrix({ scopedUserIds: req.scopedUserIds ?? null }))
  }),
}
