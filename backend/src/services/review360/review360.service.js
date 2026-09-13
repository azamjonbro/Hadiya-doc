import { PERMISSIONS } from '@lms/shared'
import { ReviewTemplate, RATER_GROUPS } from '../../models/reviewTemplate.model.js'
import { ReviewCycle } from '../../models/reviewCycle.model.js'
import { ReviewAssignment } from '../../models/reviewAssignment.model.js'
import { ReviewResponse } from '../../models/reviewResponse.model.js'
import { User } from '../../models/user.model.js'
import { competencyService } from '../competencies/competency.service.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

const canManage = (actor) => Boolean(actor?.permissions?.includes(PERMISSIONS.REVIEW360_MANAGE))
const canViewResults = (actor) =>
  Boolean(actor?.permissions?.includes(PERMISSIONS.REVIEW360_RESULTS_VIEW)) || canManage(actor)

// Priority when the same person lands in two groups. It cannot happen with
// a well-formed org chart — your manager is not also your report — but a
// mid-reorganisation snapshot can produce it, and sending one person two
// questionnaires about the same subject is worse than picking a lane.
const GROUP_PRIORITY = { SELF: 0, MANAGER: 1, SUBORDINATE: 2, PEER: 3 }

const idsEqual = (a, b) => String(a) === String(b)

/* ------------------------------------------------------------------ *
 * Shaping
 * ------------------------------------------------------------------ */

function toPublicQuestion(question) {
  return {
    id: String(question._id),
    text: question.text,
    type: question.type,
    competencyId: question.competencyId ? String(question.competencyId) : null,
    scaleMax: question.scaleMax ?? 5,
    required: question.required !== false,
    order: question.order ?? 0,
    groups: [...(question.groups ?? RATER_GROUPS)],
  }
}

function toPublicTemplate(template) {
  return {
    id: String(template._id),
    name: template.name,
    description: template.description ?? '',
    questions: (template.questions ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(toPublicQuestion),
    raterGroups: [...(template.raterGroups ?? [])],
    maxPeers: template.maxPeers ?? 10,
    maxSubordinates: template.maxSubordinates ?? 10,
    anonymousGroups: [...(template.anonymousGroups ?? [])],
    anonymityThreshold: template.anonymityThreshold ?? 3,
    status: template.status,
    updatedAt: template.updatedAt,
  }
}

function toPublicCycle(cycle, extra = {}) {
  return {
    id: String(cycle._id),
    name: cycle.name,
    description: cycle.description ?? '',
    templateId: cycle.templateId ? String(cycle.templateId) : null,
    managerId: cycle.managerId ? String(cycle.managerId) : cycle.createdBy ? String(cycle.createdBy) : null,
    status: cycle.status,
    subjectIds: (cycle.subjectIds ?? []).map(String),
    subjectCount: (cycle.subjectIds ?? []).length,
    dueAt: cycle.dueAt ?? null,
    launchedAt: cycle.launchedAt ?? null,
    closedAt: cycle.closedAt ?? null,
    anonymityThreshold: cycle.anonymityThreshold ?? 3,
    anonymousGroups: [...(cycle.anonymousGroups ?? [])],
    postToCompetencies: Boolean(cycle.postToCompetencies),
    questions: (cycle.questions ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(toPublicQuestion),
    createdAt: cycle.createdAt,
    ...extra,
  }
}

/**
 * Fisher–Yates over a copy.
 *
 * Free-text comments are shown in a random order rather than in submission
 * order, because submission order is a de-anonymiser: the report is read by
 * somebody who can also see, on the progress screen, who answered first.
 */
function shuffle(items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const average = (numbers) =>
  numbers.length ? Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100 : null

/* ------------------------------------------------------------------ *
 * Rater derivation — the point of 13.2
 * ------------------------------------------------------------------ */

/**
 * Who is asked about this person, straight off `managerId`.
 *
 * Sorted by name and capped, so a preview and the launch that follows it
 * produce the same list — HR checking "who will this go to" and then
 * getting a different set is the kind of surprise that makes people stop
 * trusting the preview.
 *
 * Inactive users are skipped everywhere: a questionnaire sent to somebody
 * who has left is a permanently PENDING row that makes every cycle look
 * unfinished.
 */
export async function deriveRaters(subject, template) {
  const wanted = new Set(template.raterGroups ?? RATER_GROUPS)
  const picks = []

  if (wanted.has('SELF')) picks.push({ raterId: subject._id, raterGroup: 'SELF' })

  if (wanted.has('MANAGER') && subject.managerId) {
    const manager = await User.findOne({ _id: subject.managerId, isActive: true }).select('_id').lean()
    if (manager) picks.push({ raterId: manager._id, raterGroup: 'MANAGER' })
  }

  if (wanted.has('PEER') && subject.managerId && (template.maxPeers ?? 10) > 0) {
    const peers = await User.find({ managerId: subject.managerId, _id: { $ne: subject._id }, isActive: true })
      .select('_id')
      .sort({ fullName: 1, _id: 1 })
      .limit(template.maxPeers ?? 10)
      .lean()
    for (const peer of peers) picks.push({ raterId: peer._id, raterGroup: 'PEER' })
  }

  if (wanted.has('SUBORDINATE') && (template.maxSubordinates ?? 10) > 0) {
    const reports = await User.find({ managerId: subject._id, isActive: true })
      .select('_id')
      .sort({ fullName: 1, _id: 1 })
      .limit(template.maxSubordinates ?? 10)
      .lean()
    for (const report of reports) picks.push({ raterId: report._id, raterGroup: 'SUBORDINATE' })
  }

  const best = new Map()
  for (const pick of picks) {
    const key = String(pick.raterId)
    const current = best.get(key)
    if (!current || GROUP_PRIORITY[pick.raterGroup] < GROUP_PRIORITY[current.raterGroup]) best.set(key, pick)
  }
  return [...best.values()]
}

/* ------------------------------------------------------------------ *
 * Anonymity
 * ------------------------------------------------------------------ */

/**
 * The N≥3 gate, in one function so there is exactly one place to audit.
 *
 * SELF is exempt — see the note on DEFAULT_ANONYMOUS_GROUPS. Everything
 * else the cycle declared anonymous stays sealed until `threshold` people
 * in that group have answered; below that, the caller gets the counts and
 * nothing derived from the answers themselves.
 */
export function isGroupRevealed(group, respondedCount, { anonymousGroups = [], anonymityThreshold = 3 } = {}) {
  if (!anonymousGroups.includes(group)) return true
  return respondedCount >= anonymityThreshold
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export const review360Service = {
  /* ---------------- templates ---------------- */

  async listTemplates({ status } = {}) {
    const filter = {}
    if (status) filter.status = status
    const items = await ReviewTemplate.find(filter).sort({ status: 1, name: 1 }).lean()
    return items.map(toPublicTemplate)
  },

  async getTemplate(id) {
    const template = await ReviewTemplate.findById(id).lean()
    if (!template) throw ApiError.notFound('Template not found')
    return toPublicTemplate(template)
  },

  async createTemplate(actor, payload) {
    const template = await ReviewTemplate.create({ ...payload, status: 'DRAFT', createdBy: actor.id })
    return toPublicTemplate(template.toObject())
  },

  /**
   * A template with a running cycle on it is frozen against edits that
   * change the instrument. It is not strictly necessary — the cycle carries
   * its own snapshot — but letting the questions drift while people are
   * answering means the preview HR sees no longer matches the cycle, and
   * the confusion costs more than the flexibility is worth.
   */
  async updateTemplate(actor, id, payload) {
    if (payload.questions || payload.raterGroups || payload.anonymityThreshold || payload.anonymousGroups) {
      const running = await ReviewCycle.countDocuments({ templateId: id, status: 'RUNNING' })
      if (running > 0) {
        throw ApiError.badRequest(
          `${running} cycle(s) are running on this template — copy it instead of changing the questions mid-flight`,
          'TEMPLATE_IN_USE'
        )
      }
    }
    const template = await ReviewTemplate.findByIdAndUpdate(
      id,
      { $set: { ...payload, updatedBy: actor.id } },
      { new: true, runValidators: true }
    )
    if (!template) throw ApiError.notFound('Template not found')
    return toPublicTemplate(template.toObject())
  },

  async removeTemplate(actor, id) {
    const used = await ReviewCycle.countDocuments({ templateId: id })
    if (used > 0) {
      throw ApiError.badRequest(
        `${used} cycle(s) were built from this template — archive it instead`,
        'TEMPLATE_IN_USE'
      )
    }
    const template = await ReviewTemplate.findByIdAndDelete(id)
    if (!template) throw ApiError.notFound('Template not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'review360.template.delete',
      entity: 'ReviewTemplate',
      entityId: String(id),
      metadata: { name: template.name },
    })
    return { deleted: true }
  },

  /* ---------------- cycles ---------------- */

  /**
   * Cycles the caller may see. A scoped manager sees the ones that contain
   * at least one of their people — not the company's, which is the whole
   * point of the fence.
   */
  async listCycles({ status, scopedUserIds = null } = {}) {
    const filter = {}
    if (status) filter.status = status
    if (scopedUserIds) filter.subjectIds = { $in: scopedUserIds }

    const cycles = await ReviewCycle.find(filter).sort({ createdAt: -1 }).lean()
    if (!cycles.length) return []

    // One grouped count for every cycle on the page rather than a query per
    // row: a list of twenty cycles is otherwise forty round trips.
    const counts = await ReviewAssignment.aggregate([
      { $match: { cycleId: { $in: cycles.map((cycle) => cycle._id) } } },
      {
        $group: {
          _id: '$cycleId',
          invited: { $sum: 1 },
          responded: { $sum: { $cond: [{ $eq: ['$status', 'SUBMITTED'] }, 1, 0] } },
        },
      },
    ])
    const byCycle = new Map(counts.map((row) => [String(row._id), row]))

    // Names for the table's "manager" and "template" columns, one query each.
    const managerIds = [...new Set(cycles.map((c) => String(c.managerId ?? c.createdBy ?? '')).filter(Boolean))]
    const templateIds = [...new Set(cycles.map((c) => c.templateId && String(c.templateId)).filter(Boolean))]
    const [managers, templatesRows] = await Promise.all([
      managerIds.length ? User.find({ _id: { $in: managerIds } }, { fullName: 1 }).lean() : [],
      templateIds.length ? ReviewTemplate.find({ _id: { $in: templateIds } }, { name: 1 }).lean() : [],
    ])
    const managerName = new Map(managers.map((u) => [String(u._id), u.fullName]))
    const templateName = new Map(templatesRows.map((t) => [String(t._id), t.name]))

    return cycles.map((cycle) => {
      const row = byCycle.get(String(cycle._id))
      return toPublicCycle(cycle, {
        invited: row?.invited ?? 0,
        responded: row?.responded ?? 0,
        managerName: managerName.get(String(cycle.managerId ?? cycle.createdBy ?? '')) ?? '',
        templateName: cycle.templateId ? (templateName.get(String(cycle.templateId)) ?? '') : '',
      })
    })
  },

  async getCycle(cycleId, { scopedUserIds = null } = {}) {
    const cycle = await ReviewCycle.findById(cycleId).lean()
    if (!cycle) throw ApiError.notFound('Cycle not found')
    if (scopedUserIds && !cycle.subjectIds.some((id) => scopedUserIds.includes(String(id)))) {
      throw ApiError.forbidden('This cycle is about people outside your team', 'SCOPE_FORBIDDEN')
    }
    return toPublicCycle(cycle)
  },

  async createCycle(actor, payload) {
    if (payload.templateId) {
      const template = await ReviewTemplate.findById(payload.templateId).lean()
      if (!template) throw ApiError.notFound('Template not found')
    }

    // Always DRAFT, whatever was sent. Launching sends a questionnaire to
    // everybody in the org chart around each subject, and that is not
    // something a mistyped field should be able to do.
    const cycle = await ReviewCycle.create({
      ...payload,
      status: 'DRAFT',
      questions: [],
      subjectIds: payload.subjectIds ?? [],
      managerId: payload.managerId ?? actor.id,
      createdBy: actor.id,
    })
    return toPublicCycle(cycle.toObject())
  },

  async updateCycle(actor, cycleId, payload) {
    const cycle = await ReviewCycle.findById(cycleId)
    if (!cycle) throw ApiError.notFound('Cycle not found')
    if (cycle.status !== 'DRAFT') {
      throw ApiError.badRequest('A launched cycle can no longer be edited', 'CYCLE_NOT_DRAFT')
    }
    Object.assign(cycle, payload, { updatedBy: actor.id })
    await cycle.save()
    return toPublicCycle(cycle.toObject())
  },

  async removeCycle(actor, cycleId) {
    const cycle = await ReviewCycle.findById(cycleId).lean()
    if (!cycle) throw ApiError.notFound('Cycle not found')
    if (cycle.status !== 'DRAFT') {
      // Answers were given under a promise; deleting the cycle deletes
      // them. Closing is the way a cycle ends.
      throw ApiError.badRequest('Only a draft cycle can be deleted', 'CYCLE_NOT_DRAFT')
    }
    await ReviewCycle.deleteOne({ _id: cycleId })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'review360.cycle.delete',
      entity: 'ReviewCycle',
      entityId: String(cycleId),
      metadata: { name: cycle.name },
    })
    return { deleted: true }
  },

  /**
   * What launching would produce, without producing it.
   *
   * HR needs to see "Aziz will be rated by 1 manager, 4 peers, 0
   * subordinates" *before* sending anything, because a subject with two
   * raters is a subject whose report will be entirely sealed by the
   * anonymity gate — better to notice that now than after the deadline.
   */
  async previewRaters(cycleId) {
    const cycle = await ReviewCycle.findById(cycleId).lean()
    if (!cycle) throw ApiError.notFound('Cycle not found')
    const template = await ReviewTemplate.findById(cycle.templateId).lean()
    if (!template) throw ApiError.notFound('Template not found')

    const subjects = await User.find({ _id: { $in: cycle.subjectIds } })
      .select('fullName position department managerId isActive')
      .lean()

    const rows = []
    for (const subject of subjects) {
      const raters = await deriveRaters(subject, template)
      const counts = Object.fromEntries(RATER_GROUPS.map((group) => [group, 0]))
      for (const rater of raters) counts[rater.raterGroup] += 1
      rows.push({
        subjectId: String(subject._id),
        fullName: subject.fullName,
        position: subject.position ?? '',
        department: subject.department ?? '',
        hasManager: Boolean(subject.managerId),
        total: raters.length,
        counts,
        // The warning that matters: these groups will never clear the gate.
        sealedGroups: (template.anonymousGroups ?? []).filter(
          (group) => counts[group] > 0 && counts[group] < (template.anonymityThreshold ?? 3)
        ),
      })
    }
    return { threshold: template.anonymityThreshold ?? 3, subjects: rows }
  },

  /**
   * DRAFT → RUNNING: freeze the instrument, derive the raters, materialise
   * the questionnaires.
   */
  async launch(actor, cycleId) {
    const cycle = await ReviewCycle.findById(cycleId)
    if (!cycle) throw ApiError.notFound('Cycle not found')
    if (cycle.status !== 'DRAFT') throw ApiError.badRequest('This cycle has already been launched', 'CYCLE_NOT_DRAFT')
    if (!cycle.subjectIds.length) throw ApiError.badRequest('A cycle needs somebody to be about', 'CYCLE_NO_SUBJECTS')
    if (!cycle.templateId) throw ApiError.badRequest('Pick a questionnaire template before launching', 'CYCLE_NO_TEMPLATE')

    const template = await ReviewTemplate.findById(cycle.templateId).lean()
    if (!template) throw ApiError.notFound('Template not found')
    if (!template.questions?.length) throw ApiError.badRequest('This template has no questions', 'TEMPLATE_EMPTY')

    const subjects = await User.find({ _id: { $in: cycle.subjectIds }, isActive: true })
      .select('fullName managerId')
      .lean()
    if (!subjects.length) throw ApiError.badRequest('None of the subjects are active', 'CYCLE_NO_SUBJECTS')

    const rows = []
    for (const subject of subjects) {
      const raters = await deriveRaters(subject, template)
      for (const rater of raters) {
        rows.push({ cycleId: cycle._id, subjectId: subject._id, raterId: rater.raterId, raterGroup: rater.raterGroup })
      }
    }
    if (!rows.length) throw ApiError.badRequest('Nobody could be derived as a rater', 'CYCLE_NO_RATERS')

    // Unordered so one duplicate — a relaunch after a partial failure —
    // does not abort the rest; the unique index is what makes that safe.
    try {
      await ReviewAssignment.insertMany(rows, { ordered: false })
    } catch (error) {
      if (error?.code !== 11000 && !error?.writeErrors) throw error
    }

    cycle.status = 'RUNNING'
    cycle.launchedAt = new Date()
    cycle.questions = template.questions.map((question) => ({
      _id: question._id,
      text: question.text,
      type: question.type,
      competencyId: question.competencyId ?? null,
      scaleMax: question.scaleMax ?? 5,
      required: question.required !== false,
      order: question.order ?? 0,
      groups: [...(question.groups ?? RATER_GROUPS)],
    }))
    cycle.anonymousGroups = [...(template.anonymousGroups ?? [])]
    cycle.anonymityThreshold = template.anonymityThreshold ?? 3
    cycle.updatedBy = actor.id
    await cycle.save()

    await auditLogRepository.record({
      actor: actor.id,
      action: 'review360.cycle.launch',
      entity: 'ReviewCycle',
      entityId: String(cycle._id),
      metadata: { name: cycle.name, subjects: subjects.length, assignments: rows.length },
    })

    // One message per rater, not per assignment: a manager of eight lands in
    // eight rows here, and eight identical notices about the same cycle is
    // how a person learns to ignore the bell. The window is also short and
    // fixed — without this the questionnaires sat unseen until the cycle
    // closed empty, because nothing else tells a rater they were named.
    const perRater = new Map()
    for (const row of rows) {
      const raterId = String(row.raterId)
      perRater.set(raterId, (perRater.get(raterId) ?? 0) + 1)
    }
    await notificationService
      .notifyMany(
        [...perRater].map(([raterId, subjectCount]) => ({
          userId: raterId,
          type: 'REVIEW360_INVITED',
          vars: {
            cycleName: cycle.name,
            subjectCount,
            deadline: cycle.dueAt ? cycle.dueAt.toISOString().slice(0, 10) : '',
          },
          relatedEntityType: 'ReviewCycle',
          relatedEntityId: String(cycle._id),
        }))
      )
      // Best-effort, as everywhere else: the assignments are already
      // written, and a mail outage must not roll a launch back.
      .catch((error) => logger.warn('360 invite failed', { error: error.message }))

    return toPublicCycle(cycle.toObject(), { invited: rows.length })
  },

  /**
   * RUNNING → CLOSED. Late answers are refused from this moment, and — if
   * the cycle was set up to — the resulting levels are posted into 13.1.
   */
  async close(actor, cycleId) {
    const cycle = await ReviewCycle.findById(cycleId)
    if (!cycle) throw ApiError.notFound('Cycle not found')
    if (cycle.status !== 'RUNNING') throw ApiError.badRequest('Only a running cycle can be closed', 'CYCLE_NOT_RUNNING')

    cycle.status = 'CLOSED'
    cycle.closedAt = new Date()
    cycle.updatedBy = actor.id
    await cycle.save()

    let outcome = { posted: 0, skipped: [] }
    if (cycle.postToCompetencies) outcome = await this.postCompetencyLevels(actor, cycle.toObject())

    await auditLogRepository.record({
      actor: actor.id,
      action: 'review360.cycle.close',
      entity: 'ReviewCycle',
      entityId: String(cycle._id),
      metadata: { name: cycle.name, competencyLevelsPosted: outcome.posted, skipped: outcome.skipped },
    })

    return toPublicCycle(cycle.toObject(), {
      competencyLevelsPosted: outcome.posted,
      competencyLevelsSkipped: outcome.skipped,
    })
  },

  /**
   * Turn the ratings on competency-linked questions into a level per
   * subject, and hand it to 13.1 rather than writing `userCompetency` here.
   *
   * Two rules keep this honest:
   *  - the average is taken across *all* raters, not per group: the output
   *    is one number about the person, and slicing it by group would put an
   *    identifiable group's opinion on their record;
   *  - a competency with fewer than the anonymity threshold of ratings is
   *    skipped, so one person's opinion can never become somebody's
   *    official level.
   */
  async postCompetencyLevels(actor, cycle) {
    const linked = (cycle.questions ?? []).filter((question) => question.type === 'RATING' && question.competencyId)
    if (!linked.length) return { posted: 0, skipped: [] }

    const responses = await ReviewResponse.find({ cycleId: cycle._id }).lean()
    if (!responses.length) return { posted: 0, skipped: [] }

    const scaleByQuestion = new Map(linked.map((question) => [String(question._id), question.scaleMax ?? 5]))
    const competencyByQuestion = new Map(linked.map((question) => [String(question._id), String(question.competencyId)]))

    // subjectId -> competencyId -> [normalised 0..1 scores]
    const buckets = new Map()
    for (const response of responses) {
      for (const answer of response.answers ?? []) {
        const key = String(answer.questionId)
        if (!competencyByQuestion.has(key) || answer.rating === null || answer.rating === undefined) continue
        const scale = scaleByQuestion.get(key) || 5
        const subjectKey = String(response.subjectId)
        if (!buckets.has(subjectKey)) buckets.set(subjectKey, new Map())
        const perCompetency = buckets.get(subjectKey)
        const competencyKey = competencyByQuestion.get(key)
        if (!perCompetency.has(competencyKey)) perCompetency.set(competencyKey, [])
        perCompetency.get(competencyKey).push(answer.rating / scale)
      }
    }

    const threshold = cycle.anonymityThreshold ?? 3
    let posted = 0
    const skipped = []
    for (const [subjectId, perCompetency] of buckets) {
      for (const [competencyId, scores] of perCompetency) {
        if (scores.length < threshold) {
          skipped.push({ subjectId, competencyId, reason: 'BELOW_THRESHOLD' })
          continue
        }
        let competency
        try {
          competency = await competencyService.getById(competencyId)
        } catch {
          // A competency deleted between design and close is not a reason
          // to fail the close — the cycle's own results are unaffected.
          skipped.push({ subjectId, competencyId, reason: 'COMPETENCY_GONE' })
          continue
        }
        if (!competency.maxLevel) {
          skipped.push({ subjectId, competencyId, reason: 'NO_SCALE' })
          continue
        }
        const ratio = scores.reduce((sum, value) => sum + value, 0) / scores.length
        const level = Math.min(competency.maxLevel, Math.max(0, Math.round(ratio * competency.maxLevel)))
        try {
          await competencyService.assess(actor, {
            userId: subjectId,
            competencyId,
            level,
            source: 'REVIEW360',
            note: `360°: ${cycle.name}`,
            evidence: { type: 'REVIEW360', refId: cycle._id },
          })
          posted += 1
        } catch (error) {
          // 13.1 fences `assess` on the closer's own scope, so a cycle that
          // spans more people than the closer may assess posts some levels
          // and not others. Closing must still succeed — the answers are
          // safe either way — but a silent partial write is how somebody
          // later concludes the integration is broken, so the reason is
          // carried out and audited rather than swallowed.
          skipped.push({ subjectId, competencyId, reason: error?.code ?? 'ASSESS_FAILED' })
        }
      }
    }
    return { posted, skipped }
  },

  /* ---------------- responding ---------------- */

  /** The questionnaires waiting for me. */
  async myAssignments(actorId, { status = 'PENDING' } = {}) {
    const filter = { raterId: actorId }
    if (status !== 'ALL') filter.status = status

    const assignments = await ReviewAssignment.find(filter)
      .populate('subjectId', 'fullName position department avatar')
      .populate('cycleId', 'name status dueAt')
      .sort({ createdAt: -1 })
      .lean()

    return assignments
      // A cycle that has been closed cannot be answered, so it does not
      // belong in an inbox that says "waiting for you".
      .filter((row) => (status === 'PENDING' ? row.cycleId?.status === 'RUNNING' : true))
      .map((row) => ({
        id: String(row._id),
        cycleId: String(row.cycleId?._id ?? row.cycleId),
        cycleName: row.cycleId?.name ?? '',
        cycleStatus: row.cycleId?.status ?? '',
        dueAt: row.cycleId?.dueAt ?? null,
        subjectId: String(row.subjectId?._id ?? row.subjectId),
        subjectName: row.subjectId?.fullName ?? '',
        subjectPosition: row.subjectId?.position ?? '',
        subjectAvatar: row.subjectId?.avatar ?? '',
        raterGroup: row.raterGroup,
        status: row.status,
        submittedAt: row.submittedAt,
      }))
  },

  /** One questionnaire, with only the questions this group is asked. */
  async getAssignment(actor, assignmentId) {
    const assignment = await ReviewAssignment.findById(assignmentId)
      .populate('subjectId', 'fullName position department avatar')
      .lean()
    if (!assignment) throw ApiError.notFound('Assignment not found')
    if (!idsEqual(assignment.raterId, actor.id)) {
      throw ApiError.forbidden('This questionnaire was sent to somebody else', 'NOT_YOUR_ASSIGNMENT')
    }

    const cycle = await ReviewCycle.findById(assignment.cycleId).lean()
    if (!cycle) throw ApiError.notFound('Cycle not found')

    const questions = (cycle.questions ?? [])
      .filter((question) => (question.groups ?? RATER_GROUPS).includes(assignment.raterGroup))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(toPublicQuestion)

    const response =
      assignment.status === 'SUBMITTED' ? await ReviewResponse.findOne({ assignmentId: assignment._id }).lean() : null

    return {
      id: String(assignment._id),
      cycleId: String(cycle._id),
      cycleName: cycle.name,
      cycleStatus: cycle.status,
      dueAt: cycle.dueAt ?? null,
      raterGroup: assignment.raterGroup,
      status: assignment.status,
      submittedAt: assignment.submittedAt,
      anonymous: (cycle.anonymousGroups ?? []).includes(assignment.raterGroup),
      anonymityThreshold: cycle.anonymityThreshold ?? 3,
      subject: {
        id: String(assignment.subjectId?._id ?? assignment.subjectId),
        fullName: assignment.subjectId?.fullName ?? '',
        position: assignment.subjectId?.position ?? '',
        department: assignment.subjectId?.department ?? '',
        avatar: assignment.subjectId?.avatar ?? '',
      },
      questions,
      answers: (response?.answers ?? []).map((answer) => ({
        questionId: String(answer.questionId),
        rating: answer.rating ?? null,
        text: answer.text ?? '',
      })),
    }
  },

  /**
   * Submit — once, by the person it was sent to, while the cycle is open.
   *
   * All three of those are checked here rather than trusted to the client,
   * and the unique index on `assignmentId` is the fourth line of defence
   * against a double-submit from a double-clicked button.
   */
  async submit(actor, assignmentId, { answers = [] } = {}) {
    const assignment = await ReviewAssignment.findById(assignmentId)
    if (!assignment) throw ApiError.notFound('Assignment not found')
    if (!idsEqual(assignment.raterId, actor.id)) {
      throw ApiError.forbidden('This questionnaire was sent to somebody else', 'NOT_YOUR_ASSIGNMENT')
    }
    if (assignment.status === 'SUBMITTED') {
      throw ApiError.conflict('This questionnaire has already been submitted and cannot be changed', 'ALREADY_SUBMITTED')
    }

    const cycle = await ReviewCycle.findById(assignment.cycleId).lean()
    if (!cycle) throw ApiError.notFound('Cycle not found')
    if (cycle.status !== 'RUNNING') {
      throw ApiError.badRequest('This review cycle is no longer accepting answers', 'CYCLE_NOT_RUNNING')
    }

    const asked = (cycle.questions ?? []).filter((question) =>
      (question.groups ?? RATER_GROUPS).includes(assignment.raterGroup)
    )
    const byId = new Map(asked.map((question) => [String(question._id), question]))
    const givenById = new Map(answers.map((answer) => [String(answer.questionId), answer]))

    const stored = []
    for (const question of asked) {
      const given = givenById.get(String(question._id))
      const rating = given?.rating ?? null
      const text = (given?.text ?? '').trim()
      const answered = question.type === 'RATING' ? rating !== null && rating !== undefined : text.length > 0

      if (question.required !== false && !answered) {
        throw ApiError.badRequest(`"${question.text}" has to be answered`, 'ANSWER_REQUIRED', {
          questionId: String(question._id),
        })
      }
      if (question.type === 'RATING' && answered) {
        const max = question.scaleMax ?? 5
        if (!Number.isInteger(rating) || rating < 1 || rating > max) {
          throw ApiError.badRequest(`A rating has to be a whole number between 1 and ${max}`, 'RATING_OFF_SCALE', {
            questionId: String(question._id),
          })
        }
      }
      if (!answered) continue

      stored.push({
        questionId: question._id,
        rating: question.type === 'RATING' ? rating : null,
        // A rating question may still carry a comment, and throwing it away
        // because the type says RATING loses the only part of a 360° that
        // tells somebody what to do differently.
        text,
        competencyId: question.competencyId ?? null,
      })
    }

    // An answer to something this group was not asked is a client bug or a
    // probe; either way it must not end up in the aggregate.
    for (const key of givenById.keys()) {
      if (!byId.has(key)) throw ApiError.badRequest('That question is not part of this questionnaire', 'UNKNOWN_QUESTION')
    }

    const submittedAt = new Date()
    try {
      await ReviewResponse.create({
        assignmentId: assignment._id,
        cycleId: assignment.cycleId,
        subjectId: assignment.subjectId,
        raterGroup: assignment.raterGroup,
        answers: stored,
        submittedAt,
      })
    } catch (error) {
      if (error?.code === 11000) {
        throw ApiError.conflict('This questionnaire has already been submitted', 'ALREADY_SUBMITTED')
      }
      throw error
    }

    assignment.status = 'SUBMITTED'
    assignment.submittedAt = submittedAt
    await assignment.save()

    return { id: String(assignment._id), status: assignment.status, submittedAt }
  },

  /* ---------------- progress and results ---------------- */

  /**
   * How far the cycle has got. Names are fine here: "who has not answered
   * yet" is exactly what a reminder needs, and it says nothing about what
   * anybody wrote.
   */
  async progress(cycleId, { scopedUserIds = null } = {}) {
    const cycle = await ReviewCycle.findById(cycleId).lean()
    if (!cycle) throw ApiError.notFound('Cycle not found')

    const filter = { cycleId: cycle._id }
    if (scopedUserIds) filter.subjectId = { $in: scopedUserIds }

    const assignments = await ReviewAssignment.find(filter)
      .populate('subjectId', 'fullName position department')
      .lean()

    const bySubject = new Map()
    for (const assignment of assignments) {
      const key = String(assignment.subjectId?._id ?? assignment.subjectId)
      if (!bySubject.has(key)) {
        bySubject.set(key, {
          subjectId: key,
          fullName: assignment.subjectId?.fullName ?? '',
          position: assignment.subjectId?.position ?? '',
          department: assignment.subjectId?.department ?? '',
          invited: 0,
          responded: 0,
          groups: Object.fromEntries(RATER_GROUPS.map((group) => [group, { invited: 0, responded: 0 }])),
        })
      }
      const row = bySubject.get(key)
      row.invited += 1
      row.groups[assignment.raterGroup].invited += 1
      if (assignment.status === 'SUBMITTED') {
        row.responded += 1
        row.groups[assignment.raterGroup].responded += 1
      }
    }

    const subjects = [...bySubject.values()].map((row) => ({
      ...row,
      percent: row.invited ? Math.round((row.responded / row.invited) * 100) : 0,
      // Flagged while there is still time to chase people, which is the
      // only moment doing so is any use.
      sealedGroups: (cycle.anonymousGroups ?? []).filter(
        (group) =>
          row.groups[group].invited > 0 && row.groups[group].responded < (cycle.anonymityThreshold ?? 3)
      ),
    }))
    subjects.sort((a, b) => a.fullName.localeCompare(b.fullName))

    return {
      cycle: toPublicCycle(cycle),
      invited: subjects.reduce((sum, row) => sum + row.invited, 0),
      responded: subjects.reduce((sum, row) => sum + row.responded, 0),
      subjects,
    }
  },

  /**
   * One person's anonymised report.
   *
   * Readable only once the cycle is CLOSED. A running aggregate can be
   * differenced: read it, wait for one more person to answer, read it
   * again, and the difference is that person's answers — which defeats the
   * gate entirely no matter how high N is.
   */
  async results(actor, cycleId, subjectId, { scopedUserIds = null } = {}) {
    const cycle = await ReviewCycle.findById(cycleId).lean()
    if (!cycle) throw ApiError.notFound('Cycle not found')
    if (!cycle.subjectIds.some((id) => idsEqual(id, subjectId))) {
      throw ApiError.notFound('That person is not part of this cycle')
    }
    if (cycle.status !== 'CLOSED') {
      throw ApiError.badRequest('Results are available once the cycle is closed', 'CYCLE_NOT_CLOSED')
    }

    const isSubject = idsEqual(actor.id, subjectId)
    if (!isSubject) {
      if (!canViewResults(actor)) {
        throw ApiError.forbidden('You may only read your own 360° report', 'NOT_YOUR_RESULTS')
      }
      if (scopedUserIds && !scopedUserIds.includes(String(subjectId))) {
        throw ApiError.forbidden('That person is outside your team', 'SCOPE_FORBIDDEN')
      }
    }

    const [subject, assignments, responses] = await Promise.all([
      User.findById(subjectId).select('fullName position department avatar').lean(),
      ReviewAssignment.find({ cycleId: cycle._id, subjectId }).select('raterGroup status').lean(),
      // Note what is *not* joined: the response collection carries a group,
      // never a rater. The aggregate below cannot leak a name because it
      // never has one.
      ReviewResponse.find({ cycleId: cycle._id, subjectId }).select('raterGroup answers').lean(),
    ])
    if (!subject) throw ApiError.notFound('User not found')

    const threshold = cycle.anonymityThreshold ?? 3
    const anonymousGroups = cycle.anonymousGroups ?? []

    const invitedByGroup = Object.fromEntries(RATER_GROUPS.map((group) => [group, 0]))
    for (const assignment of assignments) invitedByGroup[assignment.raterGroup] += 1

    const responsesByGroup = new Map(RATER_GROUPS.map((group) => [group, []]))
    for (const response of responses) responsesByGroup.get(response.raterGroup)?.push(response)

    const groups = RATER_GROUPS.filter((group) => invitedByGroup[group] > 0).map((group) => {
      const responded = responsesByGroup.get(group).length
      return {
        group,
        invited: invitedByGroup[group],
        responded,
        anonymous: anonymousGroups.includes(group),
        revealed: isGroupRevealed(group, responded, { anonymousGroups, anonymityThreshold: threshold }),
        threshold,
      }
    })
    const revealedGroups = new Set(groups.filter((row) => row.revealed).map((row) => row.group))

    const questions = (cycle.questions ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const items = []
    for (const question of questions) {
      const perGroup = []
      const othersRatings = []
      let selfRating = null
      const comments = []

      for (const group of RATER_GROUPS) {
        if (!(question.groups ?? RATER_GROUPS).includes(group)) continue
        if (invitedByGroup[group] === 0) continue

        const rows = responsesByGroup.get(group)
        const revealed = revealedGroups.has(group)
        const ratings = []
        for (const row of rows) {
          const answer = (row.answers ?? []).find((entry) => idsEqual(entry.questionId, question._id))
          if (!answer) continue
          if (answer.rating !== null && answer.rating !== undefined) ratings.push(answer.rating)
          if (revealed && answer.text) comments.push({ group, text: answer.text })
        }

        if (revealed) {
          if (group === 'SELF') selfRating = ratings[0] ?? null
          else othersRatings.push(...ratings)
        }

        perGroup.push({
          group,
          revealed,
          responded: rows.length,
          invited: invitedByGroup[group],
          average: revealed ? average(ratings) : null,
          count: revealed ? ratings.length : null,
        })
      }

      // `others` sums only revealed groups on purpose. Including a hidden
      // group here would make its average solvable: overall count and
      // average minus the revealed ones is arithmetic, and the gate would
      // be decorative.
      const others = average(othersRatings)
      items.push({
        questionId: String(question._id),
        text: question.text,
        type: question.type,
        scaleMax: question.scaleMax ?? 5,
        competencyId: question.competencyId ? String(question.competencyId) : null,
        self: selfRating,
        others,
        // The blind spot: what they think of themselves minus what everyone
        // else thinks. This, not the raw average, is what the conversation
        // after a 360° is actually about.
        gap: selfRating !== null && others !== null ? Math.round((selfRating - others) * 100) / 100 : null,
        groups: perGroup,
        comments: shuffle(comments).map((comment) => ({ group: comment.group, text: comment.text })),
      })
    }

    const byCompetency = new Map()
    for (const item of items) {
      if (!item.competencyId || item.others === null) continue
      if (!byCompetency.has(item.competencyId)) byCompetency.set(item.competencyId, [])
      byCompetency.get(item.competencyId).push(item.others)
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'review360.results.view',
      entity: 'ReviewCycle',
      entityId: String(cycle._id),
      metadata: { subjectId: String(subjectId), subjectName: subject.fullName, self: isSubject },
    })

    return {
      cycle: { id: String(cycle._id), name: cycle.name, status: cycle.status, closedAt: cycle.closedAt },
      subject: {
        id: String(subject._id),
        fullName: subject.fullName,
        position: subject.position ?? '',
        department: subject.department ?? '',
        avatar: subject.avatar ?? '',
      },
      anonymityThreshold: threshold,
      anonymousGroups: [...anonymousGroups],
      groups,
      questions: items,
      competencies: [...byCompetency.entries()].map(([competencyId, values]) => ({
        competencyId,
        average: average(values),
      })),
    }
  },
}
