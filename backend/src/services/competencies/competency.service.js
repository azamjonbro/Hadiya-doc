import { PERMISSIONS } from '@lms/shared'
import { Competency } from '../../models/competency.model.js'
import { UserCompetency, HISTORY_LIMIT } from '../../models/userCompetency.model.js'
import { User } from '../../models/user.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { assertWithinScope } from '../access/actorScope.js'
import { ApiError } from '../../utils/ApiError.js'

const canManage = (actor) => Boolean(actor.permissions?.includes(PERMISSIONS.COMPETENCY_MANAGE))
const canAssess = (actor) =>
  Boolean(actor.permissions?.includes(PERMISSIONS.COMPETENCY_ASSESS) || canManage(actor))

/** The one place a requirement value and a user field are made comparable. */
const keyOf = (value) => String(value ?? '').trim().toLowerCase()

const normalizeRequirements = (requirements = []) =>
  requirements.map((requirement) => ({
    scope: requirement.scope,
    value: String(requirement.value).trim(),
    valueKey: keyOf(requirement.value),
    level: requirement.level,
  }))

/**
 * The level this competency demands of this person, or 0 if it demands
 * nothing.
 *
 * Several requirements can match one person — their position asks for 3,
 * their department for 2. The **strictest wins**: a requirement is a floor,
 * and reading it as an average would let a department-wide bar quietly
 * lower the bar for a job.
 */
export function requiredLevelFor(competency, user) {
  const fields = { POSITION: user.position, DEPARTMENT: user.department, BRANCH: user.branch }
  let required = 0
  for (const requirement of competency.requirements ?? []) {
    const actual = keyOf(fields[requirement.scope])
    if (actual && actual === requirement.valueKey) required = Math.max(required, requirement.level)
  }
  return required
}

/**
 * What a holding is worth today.
 *
 * An expired assessment counts as 0 against the bar — that is the whole
 * point of an expiry date — but the level itself is kept and still shown.
 * "Was level 3, lapsed in March" and "never assessed" are different
 * conversations with the person, and collapsing them loses the one that
 * has an obvious next step.
 */
export function effectiveLevel(row, now = new Date()) {
  if (!row) return null
  if (row.expiresAt && row.expiresAt <= now) return 0
  return row.level
}

function statusOf(row, required, now) {
  if (!row) return required > 0 ? 'MISSING' : 'UNASSESSED'
  if (row.expiresAt && row.expiresAt <= now) return 'EXPIRED'
  if (required === 0) return 'ASSESSED'
  return row.level >= required ? 'MET' : 'GAP'
}

function toPublicCompetency(competency) {
  return {
    id: String(competency._id),
    code: competency.code,
    name: competency.name,
    description: competency.description ?? '',
    category: competency.category ?? '',
    levels: (competency.levels ?? []).map((level) => ({
      value: level.value,
      label: level.label,
      description: level.description ?? '',
    })),
    requirements: (competency.requirements ?? []).map((requirement) => ({
      id: String(requirement._id),
      scope: requirement.scope,
      value: requirement.value,
      level: requirement.level,
    })),
    developmentCourseIds: (competency.developmentCourseIds ?? []).map(String),
    validityDays: competency.validityDays ?? 0,
    status: competency.status,
    order: competency.order ?? 0,
    maxLevel: Math.max(0, ...(competency.levels ?? []).map((level) => level.value)),
    updatedAt: competency.updatedAt,
  }
}

function expiryFor(competency, assessedAt) {
  if (!competency.validityDays) return null
  return new Date(assessedAt.getTime() + competency.validityDays * 24 * 60 * 60 * 1000)
}

export const competencyService = {
  /**
   * The catalogue. Everybody signed in may read it: a learner's own gap
   * list is unreadable without the names, and a list of skills the company
   * values is not a secret. Archived ones are hidden from everyone who
   * cannot manage them — an archived competency is one HR stopped
   * believing in, and it should not turn up in a person's list.
   */
  async list(actor, { category, status, q } = {}) {
    const filter = {}
    if (category) filter.category = category
    if (canManage(actor)) {
      if (status) filter.status = status
    } else {
      filter.status = 'ACTIVE'
    }
    if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { code: new RegExp(q, 'i') }]

    const items = await Competency.find(filter).sort({ category: 1, order: 1, name: 1 }).lean()
    return items.map(toPublicCompetency)
  },

  async getById(id) {
    const competency = await Competency.findById(id).lean()
    if (!competency) throw ApiError.notFound('Competency not found')
    return toPublicCompetency(competency)
  },

  async create(actor, payload) {
    const existing = await Competency.findOne({ code: payload.code.toUpperCase() }).lean()
    if (existing) throw ApiError.conflict('A competency with this code already exists', 'COMPETENCY_CODE_TAKEN')

    const competency = await Competency.create({
      ...payload,
      requirements: normalizeRequirements(payload.requirements),
      createdBy: actor.id,
    })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'competency.create',
      entity: 'Competency',
      entityId: String(competency._id),
      metadata: { code: competency.code, name: competency.name },
    })
    return toPublicCompetency(competency.toObject())
  },

  async update(actor, id, payload) {
    const patch = { ...payload, updatedBy: actor.id }
    if (payload.requirements) patch.requirements = normalizeRequirements(payload.requirements)

    // The scale can shrink, and levels already recorded against it would
    // then be off the ruler. Refused rather than silently clamped: somebody
    // has to decide what a "level 4" becomes when there are only three
    // levels left, and it is not this function.
    if (payload.levels) {
      const max = Math.max(0, ...payload.levels.map((level) => level.value))
      const above = await UserCompetency.countDocuments({ competencyId: id, level: { $gt: max } })
      if (above > 0) {
        throw ApiError.badRequest(
          `${above} assessment(s) sit above level ${max} — reassess them before shortening the scale`,
          'COMPETENCY_SCALE_IN_USE'
        )
      }
    }

    // Checked before the write, against whichever of the two halves the
    // request did not send: the validator sees one payload and cannot know
    // how tall the stored ladder is. A requirement above the top rung puts
    // somebody permanently in the red with no level left to earn.
    const current = await Competency.findById(id).lean()
    if (!current) throw ApiError.notFound('Competency not found')
    const levels = payload.levels ?? current.levels ?? []
    const requirements = patch.requirements ?? current.requirements ?? []
    const max = Math.max(0, ...levels.map((level) => level.value))
    const unreachable = requirements.find((requirement) => requirement.level > max)
    if (unreachable) {
      throw ApiError.badRequest(
        `A requirement asks for level ${unreachable.level}, but the scale stops at ${max}`,
        'COMPETENCY_REQUIREMENT_OFF_SCALE'
      )
    }

    const competency = await Competency.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true })
    if (!competency) throw ApiError.notFound('Competency not found')

    await auditLogRepository.record({
      actor: actor.id,
      action: 'competency.update',
      entity: 'Competency',
      entityId: String(competency._id),
      metadata: { code: competency.code, fields: Object.keys(payload) },
    })
    return toPublicCompetency(competency.toObject())
  },

  /**
   * Deleting is refused as soon as anybody holds it — a level is somebody's
   * record, and the delete would take it with them. Archiving is the answer
   * and the error says so.
   */
  async remove(actor, id) {
    const held = await UserCompetency.countDocuments({ competencyId: id })
    if (held > 0) {
      throw ApiError.badRequest(
        `${held} person(s) have been assessed on this competency — archive it instead`,
        'COMPETENCY_IN_USE'
      )
    }
    const competency = await Competency.findByIdAndDelete(id)
    if (!competency) throw ApiError.notFound('Competency not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'competency.delete',
      entity: 'Competency',
      entityId: String(id),
      metadata: { code: competency.code, name: competency.name },
    })
    return { deleted: true }
  },

  /**
   * Record where somebody stands.
   *
   * Audited, and deliberately so: a competency level decides who is put on
   * a shift, who is promoted and who is sent back to training, so "who said
   * this, and when" has to survive the next edit of the row.
   */
  async assess(actor, { userId, competencyId, level, source = 'MANAGER', note = '', evidence } = {}) {
    const [competency, user] = await Promise.all([
      Competency.findById(competencyId).lean(),
      User.findById(userId).select('fullName position department branch').lean(),
    ])
    if (!competency) throw ApiError.notFound('Competency not found')
    if (!user) throw ApiError.notFound('User not found')

    // The fence lives here rather than in the controller because this is a
    // write that other instruments will call into (13.2's 360°, 13.3's OJT
    // sign-off) without passing back through an HTTP route — and a manager
    // recording a level for somebody in another department is exactly the
    // record nobody downstream can tell apart from a real one.
    await assertWithinScope(
      actor,
      userId,
      'You may only assess people you are responsible for',
      'COMPETENCY_SCOPE_FORBIDDEN'
    )

    // 0 always means "assessed, does not have it"; anything else has to be
    // a rung that exists on *this* competency's ladder. A free number would
    // make the scale decorative.
    const allowed = new Set([0, ...(competency.levels ?? []).map((entry) => entry.value)])
    if (!allowed.has(level)) {
      throw ApiError.badRequest(
        `Level ${level} is not on this competency's scale`,
        'COMPETENCY_LEVEL_OFF_SCALE',
        { allowed: [...allowed] }
      )
    }

    const assessedAt = new Date()
    const entry = { level, source, assessedBy: actor.id, assessedAt, note }
    const row = await UserCompetency.findOneAndUpdate(
      { userId, competencyId },
      {
        $set: {
          level,
          source,
          assessedBy: actor.id,
          assessedAt,
          expiresAt: expiryFor(competency, assessedAt),
          note,
          evidence: evidence ?? { type: 'NONE', refId: null },
        },
        // Newest first and trimmed in the same write, so the array cannot
        // grow without bound and `history[1]` is always the previous level —
        // which is what the before/after comparison subtracts.
        $push: { history: { $each: [entry], $position: 0, $slice: HISTORY_LIMIT } },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    const previous = row.history?.[1] ?? null
    await auditLogRepository.record({
      actor: actor.id,
      action: 'competency.assess',
      entity: 'UserCompetency',
      entityId: String(row._id),
      metadata: {
        userId: String(userId),
        fullName: user.fullName,
        competency: competency.code,
        level,
        previousLevel: previous?.level ?? null,
        source,
      },
    })

    const required = requiredLevelFor(competency, user)
    return {
      id: String(row._id),
      userId: String(userId),
      competencyId: String(competencyId),
      level: row.level,
      previousLevel: previous?.level ?? null,
      required,
      gap: Math.max(0, required - row.level),
      source: row.source,
      assessedAt: row.assessedAt,
      expiresAt: row.expiresAt,
      note: row.note ?? '',
    }
  },

  /**
   * One person against the whole catalogue: what is required of them, what
   * they hold, and where the shortfall is.
   */
  async forUser(userId, { includeUnrequired = true } = {}) {
    const user = await User.findById(userId).select('fullName position department branch').lean()
    if (!user) throw ApiError.notFound('User not found')

    const [competencies, rows] = await Promise.all([
      Competency.find({ status: 'ACTIVE' }).sort({ category: 1, order: 1, name: 1 }).lean(),
      UserCompetency.find({ userId }).lean(),
    ])
    const rowByCompetency = new Map(rows.map((row) => [String(row.competencyId), row]))
    const now = new Date()

    const items = []
    let requiredCount = 0
    let metCount = 0
    for (const competency of competencies) {
      const required = requiredLevelFor(competency, user)
      const row = rowByCompetency.get(String(competency._id))
      if (!required && !row && !includeUnrequired) continue

      const current = effectiveLevel(row, now)
      if (required > 0) {
        requiredCount += 1
        if ((current ?? 0) >= required) metCount += 1
      }

      items.push({
        competencyId: String(competency._id),
        code: competency.code,
        name: competency.name,
        category: competency.category ?? '',
        maxLevel: Math.max(0, ...(competency.levels ?? []).map((level) => level.value)),
        levels: (competency.levels ?? []).map((level) => ({ value: level.value, label: level.label })),
        required,
        level: row ? row.level : null,
        effectiveLevel: current,
        gap: Math.max(0, required - (current ?? 0)),
        status: statusOf(row, required, now),
        source: row?.source ?? null,
        assessedAt: row?.assessedAt ?? null,
        expiresAt: row?.expiresAt ?? null,
        note: row?.note ?? '',
        previousLevel: row?.history?.[1]?.level ?? null,
        developmentCourseIds: (competency.developmentCourseIds ?? []).map(String),
      })
    }

    return {
      user: {
        id: String(user._id),
        fullName: user.fullName,
        position: user.position ?? '',
        department: user.department ?? '',
        branch: user.branch ?? '',
      },
      // Role fit: of everything this person's job demands, how much they
      // meet. With nothing demanded of them the honest answer is 100 — not
      // 0, which would put every employee in a company that has not written
      // its requirements yet at the bottom of a list.
      fitPercent: requiredCount === 0 ? 100 : Math.round((metCount / requiredCount) * 100),
      requiredCount,
      metCount,
      items,
    }
  },

  /**
   * The skill matrix — people down the side, competencies across the top.
   *
   * `scopedUserIds` is the caller's fence (null means none). It is applied
   * here rather than trusted to the caller because this is the one screen
   * that reads many people at once.
   */
  async matrix({ scopedUserIds = null, department, position, branch, q, competencyIds, page = 1, limit = 25 } = {}) {
    const userFilter = { isActive: true }
    if (scopedUserIds) userFilter._id = { $in: scopedUserIds }
    if (department) userFilter.department = department
    if (position) userFilter.position = position
    if (branch) userFilter.branch = branch
    if (q) userFilter.fullName = new RegExp(q, 'i')

    const competencyFilter = { status: 'ACTIVE' }
    if (competencyIds?.length) competencyFilter._id = { $in: competencyIds }

    const [total, users, competencies] = await Promise.all([
      User.countDocuments(userFilter),
      User.find(userFilter)
        .select('fullName position department branch')
        .sort({ fullName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Competency.find(competencyFilter).sort({ category: 1, order: 1, name: 1 }).lean(),
    ])

    const rows = await UserCompetency.find({
      userId: { $in: users.map((user) => user._id) },
      competencyId: { $in: competencies.map((competency) => competency._id) },
    }).lean()
    const byUser = new Map()
    for (const row of rows) {
      const key = String(row.userId)
      if (!byUser.has(key)) byUser.set(key, new Map())
      byUser.get(key).set(String(row.competencyId), row)
    }

    const now = new Date()
    return {
      competencies: competencies.map((competency) => ({
        id: String(competency._id),
        code: competency.code,
        name: competency.name,
        category: competency.category ?? '',
        maxLevel: Math.max(0, ...(competency.levels ?? []).map((level) => level.value)),
      })),
      items: users.map((user) => {
        const held = byUser.get(String(user._id)) ?? new Map()
        let requiredCount = 0
        let metCount = 0
        const cells = competencies.map((competency) => {
          const required = requiredLevelFor(competency, user)
          const row = held.get(String(competency._id))
          const current = effectiveLevel(row, now)
          if (required > 0) {
            requiredCount += 1
            if ((current ?? 0) >= required) metCount += 1
          }
          return {
            competencyId: String(competency._id),
            level: row ? row.level : null,
            effectiveLevel: current,
            required,
            gap: Math.max(0, required - (current ?? 0)),
            status: statusOf(row, required, now),
            expiresAt: row?.expiresAt ?? null,
          }
        })
        return {
          userId: String(user._id),
          fullName: user.fullName,
          position: user.position ?? '',
          department: user.department ?? '',
          branch: user.branch ?? '',
          fitPercent: requiredCount === 0 ? 100 : Math.round((metCount / requiredCount) * 100),
          requiredCount,
          metCount,
          cells,
        }
      }),
      page,
      limit,
      total,
    }
  },

  canManage,
  canAssess,
}
