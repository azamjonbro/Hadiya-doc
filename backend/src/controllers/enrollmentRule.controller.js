import { EnrollmentRule } from '../models/enrollmentRule.model.js'
import { enrollmentRuleService } from '../services/enrollment/enrollmentRule.service.js'
import { auditLogRepository } from '../repositories/auditLog.repository.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'

export const enrollmentRuleController = {
  list: asyncHandler(async (_req, res) => {
    const items = await EnrollmentRule.find().sort({ createdAt: -1 }).lean()
    sendSuccess(res, { items })
  }),

  create: asyncHandler(async (req, res) => {
    // Created inactive whatever the caller says. A rule that assigns
    // courses to hundreds of people the moment it is saved is not something
    // to do by accident — it is written first and switched on deliberately.
    const rule = await EnrollmentRule.create({ ...req.body, active: false, createdBy: req.user.id })
    sendSuccess(res, { rule }, 'Rule created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    const rule = await EnrollmentRule.findByIdAndUpdate(
      req.params.id,
      { $set: { ...req.body, updatedBy: req.user.id } },
      { new: true, runValidators: true }
    )
    if (!rule) throw ApiError.notFound('Rule not found')

    // Switching a rule on applies it immediately rather than waiting for
    // the nightly sweep, which is what somebody clicking "activate"
    // expects to happen.
    if (req.body.active === true) {
      const result = await enrollmentRuleService.applyRule(rule.toObject())
      await auditLogRepository.record({
        actor: req.user.id,
        action: 'ENROLLMENT_RULE_ACTIVATED',
        entity: 'EnrollmentRule',
        entityId: String(rule._id),
        metadata: result,
      })
      sendSuccess(res, { rule, applied: result })
      return
    }
    sendSuccess(res, { rule })
  }),

  remove: asyncHandler(async (req, res) => {
    const rule = await EnrollmentRule.findByIdAndDelete(req.params.id)
    if (!rule) throw ApiError.notFound('Rule not found')
    // The assignments it already made stay: people are part-way through
    // them, and deleting a rule is not a decision to revoke training.
    await auditLogRepository.record({
      actor: req.user.id,
      action: 'ENROLLMENT_RULE_DELETED',
      entity: 'EnrollmentRule',
      entityId: String(req.params.id),
      metadata: { name: rule.name },
    })
    sendSuccess(res, { deleted: true })
  }),

  /** What it would do, without doing it. */
  preview: asyncHandler(async (req, res) => {
    const rule = await EnrollmentRule.findById(req.params.id).lean()
    if (!rule) throw ApiError.notFound('Rule not found')
    sendSuccess(res, await enrollmentRuleService.preview(rule))
  }),

  run: asyncHandler(async (req, res) => {
    const rule = await EnrollmentRule.findById(req.params.id).lean()
    if (!rule) throw ApiError.notFound('Rule not found')
    sendSuccess(res, await enrollmentRuleService.applyRule(rule), 'Rule applied')
  }),
}
