import { DevelopmentPlan } from '../../models/developmentPlan.model.js'
import { DevelopmentPlanTemplate } from '../../models/developmentPlanTemplate.model.js'
import { DevelopmentPlanType } from '../../models/developmentPlanType.model.js'
import { User } from '../../models/user.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { assertWithinScope } from '../access/actorScope.js'
import { developmentPlanService } from './developmentPlan.service.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Plan types and templates (rasn 12–14).
 *
 * Two types are seeded and locked: the individual development plan and
 * the adaptation plan, each with its pair of outcomes. A template is a
 * plan without a person; assigning it copies the goals into real plans,
 * so what a template said on the day is what the person got.
 */
const SYSTEM_TYPES = [
  {
    key: 'IDP',
    name: 'Individual rivojlanish rejasi',
    description: "Xodimning kompetensiyalarini karyera o'sishi va joriy vazifalar uchun nuqtali rivojlantirish.",
    outcomes: [
      { key: 'ACHIEVED', label: 'Maqsadlarga erishildi', positive: true },
      { key: 'NOT_ACHIEVED', label: 'Maqsadlarga erishilmadi', positive: false },
    ],
  },
  {
    key: 'ADAPTATION',
    name: 'Moslashuv rejasi',
    description: "Yangi xodimni birinchi kundan birinchi natijalargacha ish muhitiga bosqichma-bosqich kiritish.",
    outcomes: [
      { key: 'COMPLETED', label: 'Muvaffaqiyatli yakunlandi', positive: true },
      { key: 'NOT_COMPLETED', label: 'Yakunlanmadi', positive: false },
    ],
  },
]

function toPublicType(row) {
  return {
    id: String(row._id),
    key: row.key,
    name: row.name,
    description: row.description ?? '',
    outcomes: row.outcomes ?? [],
    status: row.status,
    isSystem: Boolean(row.isSystem),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toPublicTemplate(row, extra = {}) {
  return {
    id: String(row._id),
    name: row.name,
    typeId: String(row.typeId),
    description: row.description ?? '',
    cover: row.cover ?? '',
    durationDays: row.durationDays ?? 90,
    goals: row.goals ?? [],
    status: row.status,
    createdBy: row.createdBy ? String(row.createdBy) : null,
    updatedBy: row.updatedBy ? String(row.updatedBy) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...extra,
  }
}

// Seeded on first read rather than at boot: the collection is tiny and
// the page that needs it is the one that asks.
async function ensureSystemTypes() {
  for (const type of SYSTEM_TYPES) {
    await DevelopmentPlanType.updateOne(
      { key: type.key },
      { $setOnInsert: { ...type, isSystem: true, status: 'PUBLISHED' } },
      { upsert: true }
    )
  }
}

export const planTemplateService = {
  // ----- types -----
  async listTypes() {
    await ensureSystemTypes()
    const rows = await DevelopmentPlanType.find().sort({ isSystem: -1, name: 1 }).lean()
    return { items: rows.map(toPublicType) }
  },

  async createType(actor, payload) {
    const key = payload.name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40)
    if (await DevelopmentPlanType.exists({ key })) throw ApiError.conflict('A plan type with this name exists', 'PLAN_TYPE_EXISTS')
    const row = await DevelopmentPlanType.create({ ...payload, key, createdBy: actor.id })
    return toPublicType(row)
  },

  async updateType(actor, id, payload) {
    const row = await DevelopmentPlanType.findById(id)
    if (!row) throw ApiError.notFound('Plan type not found')
    // A system type keeps its outcomes — plans already ended with them.
    if (row.isSystem && payload.outcomes) throw ApiError.forbidden('The outcomes of a built-in type are fixed', 'PLAN_TYPE_LOCKED')
    Object.assign(row, payload)
    await row.save()
    return toPublicType(row)
  },

  async removeType(actor, id) {
    const row = await DevelopmentPlanType.findById(id)
    if (!row) throw ApiError.notFound('Plan type not found')
    if (row.isSystem) throw ApiError.forbidden('A built-in type cannot be deleted', 'PLAN_TYPE_LOCKED')
    const used = await DevelopmentPlanTemplate.countDocuments({ typeId: row._id })
    if (used) throw ApiError.conflict('Templates still use this type', 'PLAN_TYPE_IN_USE')
    await row.deleteOne()
    return { deleted: true }
  },

  // ----- templates -----
  async listTemplates() {
    const rows = await DevelopmentPlanTemplate.find().sort({ updatedAt: -1 }).lean()
    const ids = rows.map((row) => row._id)
    const [assignments, editors] = await Promise.all([
      DevelopmentPlan.aggregate([{ $match: { templateId: { $in: ids } } }, { $group: { _id: '$templateId', count: { $sum: 1 } } }]),
      userRepository.findByIds([...new Set(rows.map((row) => String(row.updatedBy ?? row.createdBy)))]),
    ])
    const countById = new Map(assignments.map((row) => [String(row._id), row.count]))
    const nameById = new Map(editors.map((user) => [String(user._id), user.fullName]))
    return {
      items: rows.map((row) =>
        toPublicTemplate(row, {
          assignmentCount: countById.get(String(row._id)) ?? 0,
          updatedByName: nameById.get(String(row.updatedBy ?? row.createdBy)) ?? '',
        })
      ),
    }
  },

  async getTemplate(id) {
    const row = await DevelopmentPlanTemplate.findById(id).lean()
    if (!row) throw ApiError.notFound('Plan template not found')
    return toPublicTemplate(row)
  },

  async createTemplate(actor, payload) {
    if (!(await DevelopmentPlanType.exists({ _id: payload.typeId }))) throw ApiError.badRequest('Unknown plan type', 'PLAN_TYPE_UNKNOWN')
    const row = await DevelopmentPlanTemplate.create({ ...payload, createdBy: actor.id })
    return toPublicTemplate(row)
  },

  async updateTemplate(actor, id, payload) {
    const row = await DevelopmentPlanTemplate.findById(id)
    if (!row) throw ApiError.notFound('Plan template not found')
    if (payload.typeId && !(await DevelopmentPlanType.exists({ _id: payload.typeId }))) throw ApiError.badRequest('Unknown plan type', 'PLAN_TYPE_UNKNOWN')
    Object.assign(row, payload, { updatedBy: actor.id })
    await row.save()
    return toPublicTemplate(row)
  },

  async removeTemplate(actor, id) {
    const row = await DevelopmentPlanTemplate.findById(id)
    if (!row) throw ApiError.notFound('Plan template not found')
    await row.deleteOne()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'DEVPLAN_TEMPLATE_DELETED',
      entity: 'DevelopmentPlanTemplate',
      entityId: id,
      metadata: { name: row.name },
    })
    return { deleted: true }
  },

  /**
   * "Создать план" (rasn 13): one plan per person from the template. Each
   * goal's due date is the plan's start plus the goal's offset; the plan
   * itself is a DRAFT unless asked otherwise, so a manager reads it before
   * the employee sees it. Goes through the plan service so scope, base
   * levels and notifications are the same as for a hand-written plan.
   */
  async assign(actor, id, { userIds, periodStart, periodEnd, status = 'DRAFT' }) {
    const template = await DevelopmentPlanTemplate.findById(id).lean()
    if (!template) throw ApiError.notFound('Plan template not found')
    const start = new Date(periodStart)
    const end = periodEnd ? new Date(periodEnd) : new Date(start.getTime() + template.durationDays * 86400e3)
    const created = []
    const skipped = []
    for (const userId of userIds) {
      const user = await User.findById(userId).select('_id').lean()
      if (!user) {
        skipped.push({ userId, reason: 'USER_NOT_FOUND' })
        continue
      }
      try {
        await assertWithinScope(actor, userId, 'This employee is outside your scope', 'DEVPLAN_SCOPE_FORBIDDEN')
      } catch {
        skipped.push({ userId, reason: 'OUT_OF_SCOPE' })
        continue
      }
      const plan = await developmentPlanService.create(actor, {
        userId,
        title: template.name,
        periodStart: start,
        periodEnd: end,
        status,
        goals: template.goals.map((goal) => ({
          type: goal.type,
          title: goal.title,
          description: goal.description,
          courseId: goal.courseId ? String(goal.courseId) : null,
          competencyId: goal.competencyId ? String(goal.competencyId) : null,
          targetLevel: goal.targetLevel,
          ojtChecklistId: goal.ojtChecklistId,
          targetDate: goal.dueInDays != null ? new Date(start.getTime() + goal.dueInDays * 86400e3) : null,
          weight: goal.weight,
          cpeCredits: goal.cpeCredits,
        })),
      })
      await DevelopmentPlan.updateOne({ _id: plan.id }, { $set: { templateId: template._id, typeId: template.typeId } })
      created.push(plan.id)
    }
    return { created, skipped }
  },
}
