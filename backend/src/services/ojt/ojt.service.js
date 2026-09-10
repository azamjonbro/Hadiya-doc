import { PERMISSIONS } from '@lms/shared'
import { OjtChecklist } from '../../models/ojtChecklist.model.js'
import { OjtSession } from '../../models/ojtSession.model.js'
import { OjtObservation } from '../../models/ojtObservation.model.js'
import { Competency } from '../../models/competency.model.js'
import { User } from '../../models/user.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { competencyService } from '../competencies/competency.service.js'
import { scopedUserIdsFor, hasUnscopedAccess } from '../access/actorScope.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * On-the-job training (13.3).
 *
 * The three rules everything else in this file serves:
 *
 *   1. **A session owns its own copy of the list.** Editing a checklist
 *      bumps its version and changes nothing about a session that has
 *      already started. Evidence whose wording can be changed afterwards
 *      is not evidence.
 *   2. **Only the named observer records.** Not their manager, not an
 *      administrator. A signature that somebody else could have produced
 *      says nothing about who was standing there.
 *   3. **What was not observed is not scored.** A shift does not throw up
 *      every situation on the list; marking those down would punish the
 *      trainee for the day's work, and marking them up would be invention.
 */

const canManage = (actor) => Boolean(actor?.permissions?.includes(PERMISSIONS.OJT_MANAGE))
const canObserve = (actor) => Boolean(actor?.permissions?.includes(PERMISSIONS.OJT_OBSERVE))

const sameId = (a, b) => Boolean(a) && Boolean(b) && String(a) === String(b)

/** Item fields the checklist owns, in the shape a session stores them. */
function snapshotItems(checklist) {
  return [...(checklist.items ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => ({
      itemId: item._id,
      title: item.title,
      criteria: item.criteria ?? '',
      order: item.order ?? 0,
      required: item.required !== false,
      weight: item.weight ?? 1,
      competencyId: item.competencyId ?? null,
      competencyLevel: item.competencyLevel ?? null,
      result: null,
    }))
}

/**
 * The arithmetic, in one place because three callers need the same answer:
 * the observer's running total, the completion, and the stored result.
 *
 * The denominator is the weight of what was actually judged. With nothing
 * judged the percentage is 0 rather than 100 — an empty session is not a
 * pass, and `0/0 = NaN` is not a number anybody can put in a report.
 */
export function computeScore(items = [], passThresholdPercent = 80) {
  let passed = 0
  let failed = 0
  let notObserved = 0
  let assessedWeight = 0
  let earnedWeight = 0
  let requiredMet = true

  for (const item of items) {
    const weight = item.weight ?? 1
    if (item.result === 'PASS') {
      passed += 1
      assessedWeight += weight
      earnedWeight += weight
    } else if (item.result === 'FAIL') {
      failed += 1
      assessedWeight += weight
    } else if (item.result === 'NOT_OBSERVED') {
      notObserved += 1
    }
    // A required item fails the session unless it was seen and passed —
    // however good the rest was. "Mostly competent" and "did not isolate
    // the power before opening the panel" are not the same session.
    if (item.required !== false && item.result !== 'PASS') requiredMet = false
  }

  const percent = assessedWeight > 0 ? Math.round((earnedWeight / assessedWeight) * 100) : 0
  return {
    score: { passed, failed, notObserved, assessedWeight, earnedWeight, percent },
    requiredMet,
    outcome: requiredMet && percent >= passThresholdPercent ? 'PASS' : 'FAIL',
  }
}

function toPublicChecklist(checklist) {
  return {
    id: String(checklist._id),
    name: checklist.name,
    description: checklist.description ?? '',
    position: checklist.position ?? '',
    department: checklist.department ?? '',
    passThresholdPercent: checklist.passThresholdPercent ?? 80,
    version: checklist.version ?? 1,
    status: checklist.status,
    items: [...(checklist.items ?? [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item) => ({
        id: String(item._id),
        title: item.title,
        criteria: item.criteria ?? '',
        order: item.order ?? 0,
        required: item.required !== false,
        weight: item.weight ?? 1,
        competencyId: item.competencyId ? String(item.competencyId) : null,
        competencyLevel: item.competencyLevel ?? null,
      })),
    updatedAt: checklist.updatedAt,
  }
}

const nameOf = (value) => (value && typeof value === 'object' ? (value.fullName ?? '') : '')
const idOf = (value) => (value && typeof value === 'object' && value._id ? String(value._id) : value ? String(value) : null)

function toPublicSession(session, { withItems = true } = {}) {
  const live = computeScore(session.items ?? [], session.passThresholdPercent ?? 80)
  return {
    id: String(session._id),
    checklistId: idOf(session.checklistId),
    checklistName: session.checklistName ?? '',
    checklistVersion: session.checklistVersion ?? 1,
    passThresholdPercent: session.passThresholdPercent ?? 80,
    traineeId: idOf(session.traineeId),
    traineeName: nameOf(session.traineeId),
    observerId: idOf(session.observerId),
    observerName: nameOf(session.observerId),
    location: session.location ?? '',
    status: session.status,
    scheduledAt: session.scheduledAt,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    observerNote: session.observerNote ?? '',
    // A finished session reports what was stored; an unfinished one reports
    // where it stands now, so the observer sees the total move as they go.
    score: session.status === 'COMPLETED' ? session.score : live.score,
    outcome: session.status === 'COMPLETED' ? session.outcome : null,
    requiredMet: live.requiredMet,
    signedAt: session.signOff?.signedAt ?? null,
    signedBy: idOf(session.signOff?.signedBy),
    signOffNote: session.signOff?.note ?? '',
    postedCompetencies: (session.signOff?.postedCompetencies ?? []).map((entry) => ({
      competencyId: String(entry.competencyId),
      level: entry.level,
    })),
    ...(withItems
      ? {
          items: (session.items ?? []).map((item) => ({
            itemId: String(item.itemId),
            title: item.title,
            criteria: item.criteria ?? '',
            order: item.order ?? 0,
            required: item.required !== false,
            weight: item.weight ?? 1,
            competencyId: item.competencyId ? String(item.competencyId) : null,
            competencyLevel: item.competencyLevel ?? null,
            result: item.result ?? null,
          })),
        }
      : {}),
  }
}

/**
 * A level on an item has to be a rung that exists on that competency's
 * ladder — checked when the checklist is saved, not when it is signed off.
 *
 * The late check is the trap: the session's items are frozen copies, so an
 * off-scale level discovered at sign-off leaves an observer on a shop floor
 * holding a session that can never be signed, and no edit to the checklist
 * can free it.
 */
async function assertLevelsOnScale(items = []) {
  const linked = items.filter((item) => item.competencyId)
  if (!linked.length) return
  const competencies = await Competency.find({
    _id: { $in: linked.map((item) => item.competencyId) },
  })
    .select('code name levels')
    .lean()
  const byId = new Map(competencies.map((competency) => [String(competency._id), competency]))

  for (const item of linked) {
    const competency = byId.get(String(item.competencyId))
    if (!competency) throw ApiError.badRequest(`Competency not found for item "${item.title}"`, 'COMPETENCY_NOT_FOUND')
    if (item.competencyLevel == null) {
      throw ApiError.badRequest(`Item "${item.title}" links a competency but no level`, 'OJT_ITEM_LEVEL_MISSING')
    }
    const allowed = new Set([0, ...(competency.levels ?? []).map((level) => level.value)])
    if (!allowed.has(item.competencyLevel)) {
      throw ApiError.badRequest(
        `Level ${item.competencyLevel} is not on ${competency.code}'s scale`,
        'COMPETENCY_LEVEL_OFF_SCALE',
        { item: item.title, allowed: [...allowed] }
      )
    }
  }
}

/** Would this edit change what an observer is asked to judge? */
function touchesItems(payload) {
  return payload.items !== undefined || payload.passThresholdPercent !== undefined
}

function assertObserver(actor, session) {
  if (!sameId(session.observerId?._id ?? session.observerId, actor.id)) {
    throw ApiError.forbidden('Only the observer named on this session may record on it', 'NOT_SESSION_OBSERVER')
  }
}

/**
 * A completed session is closed to writes, full stop.
 *
 * Reopening would mean a result that changed after somebody read it, and
 * the honest way to correct an OJT session is to run another one — which
 * is also the only version a regulator would accept.
 */
function assertMutable(session) {
  if (session.status === 'COMPLETED') {
    throw ApiError.conflict('This session is completed and cannot be changed', 'OJT_SESSION_COMPLETED')
  }
  if (session.status === 'CANCELLED') {
    throw ApiError.conflict('This session was cancelled', 'OJT_SESSION_CANCELLED')
  }
}

export const ojtService = {
  // ---------------------------------------------------------------- checklists

  async listChecklists(actor, { status, q } = {}) {
    const filter = {}
    // Somebody who only observes needs the catalogue to make sense of their
    // sessions, but an archived list is one the company stopped believing
    // in and must not turn up as something to schedule.
    if (canManage(actor)) {
      if (status) filter.status = status
    } else {
      filter.status = 'ACTIVE'
    }
    if (q) filter.name = new RegExp(q, 'i')
    const items = await OjtChecklist.find(filter).sort({ name: 1 }).lean()
    return items.map(toPublicChecklist)
  },

  async getChecklist(id) {
    const checklist = await OjtChecklist.findById(id).lean()
    if (!checklist) throw ApiError.notFound('Checklist not found', 'OJT_CHECKLIST_NOT_FOUND')
    return toPublicChecklist(checklist)
  },

  async createChecklist(actor, payload) {
    await assertLevelsOnScale(payload.items ?? [])
    const checklist = await OjtChecklist.create({
      ...payload,
      // Created as a draft whatever was sent, like an onboarding programme:
      // a half-written list that people can already be scheduled against is
      // not something to switch on by accident.
      status: 'DRAFT',
      version: 1,
      createdBy: actor.id,
    })
    return toPublicChecklist(checklist.toObject())
  },

  async updateChecklist(actor, id, payload) {
    if (payload.items) await assertLevelsOnScale(payload.items)
    const patch = { ...payload, updatedBy: actor.id }
    const update = { $set: patch }
    // The version is what a session's frozen copy points back at, so it
    // only moves when the thing being observed actually changes. Renaming
    // the list is not a new edition of it.
    if (touchesItems(payload)) update.$inc = { version: 1 }

    const checklist = await OjtChecklist.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    if (!checklist) throw ApiError.notFound('Checklist not found', 'OJT_CHECKLIST_NOT_FOUND')
    return toPublicChecklist(checklist.toObject())
  },

  /**
   * Refused as soon as any session has been run against it. Deleting would
   * not touch those sessions — they carry their own copy — but it would
   * leave a signed record pointing at nothing, and "which list was this"
   * unanswerable. Archiving is the answer and the error says so.
   */
  async removeChecklist(actor, id) {
    const used = await OjtSession.countDocuments({ checklistId: id })
    if (used > 0) {
      throw ApiError.badRequest(
        `${used} session(s) have been run against this checklist — archive it instead`,
        'OJT_CHECKLIST_IN_USE'
      )
    }
    const checklist = await OjtChecklist.findByIdAndDelete(id)
    if (!checklist) throw ApiError.notFound('Checklist not found', 'OJT_CHECKLIST_NOT_FOUND')
    return { deleted: true }
  },

  // ------------------------------------------------------------------ sessions

  async createSession(actor, { checklistId, traineeId, observerId, scheduledAt, location = '' }) {
    const [checklist, trainee, observer] = await Promise.all([
      OjtChecklist.findById(checklistId).lean(),
      User.findById(traineeId).select('fullName managerId').lean(),
      User.findById(observerId).select('fullName').lean(),
    ])
    if (!checklist) throw ApiError.notFound('Checklist not found', 'OJT_CHECKLIST_NOT_FOUND')
    if (!trainee) throw ApiError.notFound('Trainee not found', 'USER_NOT_FOUND')
    if (!observer) throw ApiError.notFound('Observer not found', 'USER_NOT_FOUND')
    if (checklist.status !== 'ACTIVE') {
      throw ApiError.badRequest('Only an active checklist can be scheduled', 'OJT_CHECKLIST_NOT_ACTIVE')
    }
    if (!checklist.items?.length) {
      throw ApiError.badRequest('This checklist has no items to observe', 'OJT_CHECKLIST_EMPTY')
    }
    // Watching yourself is not an observation.
    if (sameId(traineeId, observerId)) {
      throw ApiError.badRequest('The observer cannot be the trainee', 'OJT_SELF_OBSERVATION')
    }

    const session = await OjtSession.create({
      checklistId,
      checklistName: checklist.name,
      checklistVersion: checklist.version ?? 1,
      passThresholdPercent: checklist.passThresholdPercent ?? 80,
      traineeId,
      observerId,
      managerId: trainee.managerId ?? null,
      location,
      scheduledAt: scheduledAt ?? new Date(),
      items: snapshotItems(checklist),
      createdBy: actor.id,
    })
    return toPublicSession(session.toObject())
  },

  /**
   * Who may see this session at all.
   *
   * The trainee is on the list on purpose: being assessed and not being
   * allowed to read the assessment is how an OJT record becomes something
   * people distrust.
   */
  async assertVisible(actor, session, scopedUserIds = null) {
    if (sameId(session.observerId?._id ?? session.observerId, actor.id)) return
    if (sameId(session.traineeId?._id ?? session.traineeId, actor.id)) return
    if (canManage(actor)) {
      if (!scopedUserIds) return
      if (scopedUserIds.some((id) => sameId(id, session.traineeId?._id ?? session.traineeId))) return
    }
    throw ApiError.forbidden('This session is not yours to read', 'OJT_SESSION_FORBIDDEN')
  },

  async listSessions(actor, { scopedUserIds = null, status, traineeId, observerId, mine, page = 1, limit = 25 } = {}) {
    const filter = {}
    if (status) filter.status = status

    if (mine || !canManage(actor)) {
      // Without the manage permission there is exactly one list worth
      // showing, and it is the caller's own. Applied here rather than
      // trusted to a query parameter — a filter the client chooses is not
      // a fence.
      filter.observerId = actor.id
    } else {
      if (observerId) filter.observerId = observerId
      if (traineeId) filter.traineeId = traineeId
      // A manager sees their own people and no one else's.
      if (scopedUserIds) {
        filter.traineeId = traineeId
          ? { $in: scopedUserIds.filter((id) => sameId(id, traineeId)) }
          : { $in: scopedUserIds }
      }
    }

    const [total, rows] = await Promise.all([
      OjtSession.countDocuments(filter),
      OjtSession.find(filter)
        .populate('traineeId', 'fullName position department')
        .populate('observerId', 'fullName')
        .sort({ scheduledAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ])
    // The list does not carry the items: a shift's worth of sessions with
    // twenty items each is a payload nobody reads, on the connection least
    // able to afford it.
    return { items: rows.map((row) => toPublicSession(row, { withItems: false })), page, limit, total }
  },

  async getSession(actor, id, { scopedUserIds = null } = {}) {
    const session = await OjtSession.findById(id)
      .populate('traineeId', 'fullName position department')
      .populate('observerId', 'fullName')
      .lean()
    if (!session) throw ApiError.notFound('Session not found', 'OJT_SESSION_NOT_FOUND')
    await this.assertVisible(actor, session, scopedUserIds)

    const observations = await OjtObservation.find({ sessionId: id }).lean()
    const byItem = new Map(observations.map((row) => [String(row.itemId), row]))
    const view = toPublicSession(session)
    view.items = view.items.map((item) => {
      const observation = byItem.get(item.itemId)
      return {
        ...item,
        note: observation?.note ?? '',
        observedAt: observation?.observedAt ?? null,
      }
    })
    return view
  },

  /**
   * SCHEDULED → IN_PROGRESS.
   *
   * Also happens implicitly on the first observation, because the observer
   * may well be in a basement when they record it and a form that needs a
   * round trip before it can accept an answer is a form that fails exactly
   * where this one is used.
   */
  async startSession(actor, id) {
    const session = await OjtSession.findById(id)
    if (!session) throw ApiError.notFound('Session not found', 'OJT_SESSION_NOT_FOUND')
    assertObserver(actor, session)
    assertMutable(session)
    if (session.status === 'IN_PROGRESS') return toPublicSession(session.toObject())

    // Nothing has been observed yet, so there is no history to protect and
    // the observer should be given the current wording — the one case where
    // re-copying the checklist is right.
    const checklist = await OjtChecklist.findById(session.checklistId).lean()
    if (checklist && (checklist.version ?? 1) !== session.checklistVersion) {
      session.items = snapshotItems(checklist)
      session.checklistVersion = checklist.version ?? 1
      session.checklistName = checklist.name
      session.passThresholdPercent = checklist.passThresholdPercent ?? 80
    }

    session.status = 'IN_PROGRESS'
    session.startedAt = new Date()
    await session.save()
    return toPublicSession(session.toObject())
  },

  async recordObservation(actor, sessionId, itemId, { result, note = '', recordedAt = null } = {}) {
    const session = await OjtSession.findById(sessionId)
    if (!session) throw ApiError.notFound('Session not found', 'OJT_SESSION_NOT_FOUND')
    assertObserver(actor, session)
    assertMutable(session)

    const item = session.items.find((entry) => sameId(entry.itemId, itemId))
    if (!item) throw ApiError.notFound('This item is not on the session', 'OJT_ITEM_NOT_FOUND')

    if (session.status === 'SCHEDULED') {
      session.status = 'IN_PROGRESS'
      session.startedAt = recordedAt ?? new Date()
    }
    item.result = result

    // Upsert on (sessionId, itemId): changing your mind overwrites the
    // verdict instead of appending a second one, which is also what makes
    // a replay from the offline queue harmless.
    await OjtObservation.findOneAndUpdate(
      { sessionId, itemId },
      {
        $set: {
          result,
          note,
          observedBy: actor.id,
          observedAt: new Date(),
          recordedAt: recordedAt ?? null,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    )

    await session.save()
    const live = computeScore(session.items, session.passThresholdPercent)
    return { sessionId: String(sessionId), itemId: String(itemId), result, note, ...live }
  },

  /**
   * IN_PROGRESS → COMPLETED, with the score frozen onto the session.
   *
   * Stored rather than derived, because the weights and the threshold both
   * live on a checklist that can be edited tomorrow, and a result that
   * moves is not a result.
   */
  async completeSession(actor, id, { note = '' } = {}) {
    const session = await OjtSession.findById(id)
    if (!session) throw ApiError.notFound('Session not found', 'OJT_SESSION_NOT_FOUND')
    assertObserver(actor, session)
    assertMutable(session)

    // A required item left unanswered — or answered "not observed" — means
    // the session is not finished. The honest move is another shift, not a
    // result with a hole in it.
    const pending = session.items.filter(
      (item) => item.required !== false && item.result !== 'PASS' && item.result !== 'FAIL'
    )
    if (pending.length) {
      throw ApiError.badRequest(
        `${pending.length} required item(s) have not been observed yet`,
        'OJT_REQUIRED_ITEMS_PENDING',
        { items: pending.map((item) => item.title) }
      )
    }

    const { score, outcome } = computeScore(session.items, session.passThresholdPercent)
    session.score = score
    session.outcome = outcome
    session.status = 'COMPLETED'
    session.completedAt = new Date()
    if (note) session.observerNote = note
    await session.save()
    return toPublicSession(session.toObject())
  },

  /**
   * The signature, and the only thing that touches the skill matrix.
   *
   * Completing says "I have been through the list". Signing says "and I
   * stand behind it" — so it is separate, audited, and posts a level per
   * passed item that carries a competency, with source OJT and the session
   * as its evidence. A failed or unobserved item posts nothing: watching
   * somebody not manage it is not a reason to raise their level.
   */
  async signOff(actor, id, { note = '' } = {}) {
    const session = await OjtSession.findById(id)
    if (!session) throw ApiError.notFound('Session not found', 'OJT_SESSION_NOT_FOUND')

    // The observer signs; somebody with ojt:manage may counter-sign for
    // them (an observer who left, a supervisor closing the record), and
    // the audit entry says which of the two it was.
    if (!sameId(session.observerId, actor.id) && !canManage(actor)) {
      throw ApiError.forbidden('Only the observer or an OJT manager may sign off', 'NOT_SESSION_OBSERVER')
    }
    if (session.status !== 'COMPLETED') {
      throw ApiError.badRequest('Only a completed session can be signed off', 'OJT_SESSION_NOT_COMPLETED')
    }
    if (session.signOff?.signedAt) {
      throw ApiError.conflict('This session is already signed off', 'OJT_ALREADY_SIGNED')
    }

    // Several items can point at the same competency — three ways of
    // showing the same skill. The best demonstrated level wins; averaging
    // them would let an easy item drag down a hard one that was passed.
    const levels = new Map()
    for (const item of session.items) {
      if (item.result !== 'PASS' || !item.competencyId || item.competencyLevel == null) continue
      const key = String(item.competencyId)
      levels.set(key, Math.max(levels.get(key) ?? 0, item.competencyLevel))
    }

    /**
     * The scope check happens **before** anything is written.
     *
     * `competencyService.assess` fences on the org scope of whoever calls
     * it, and being named as the observer on a session does not widen that
     * — an INSTRUCTOR is SELF-scoped by default. Discovering it inside the
     * loop would leave a session with some levels posted, some not, and no
     * signature; asking first leaves it COMPLETED and unsigned, which a
     * manager can counter-sign. Skipped entirely when the checklist links
     * no competencies, because then signing touches nobody's record.
     */
    if (levels.size && !hasUnscopedAccess(actor)) {
      const allowed = await scopedUserIdsFor(actor)
      if (!allowed.includes(String(session.traineeId))) {
        throw ApiError.forbidden(
          'Signing this session would post competency levels for somebody outside your scope — a manager has to counter-sign',
          'OJT_SIGNOFF_SCOPE_FORBIDDEN'
        )
      }
    }

    const posted = []
    for (const [competencyId, level] of levels) {
      await competencyService.assess(actor, {
        userId: String(session.traineeId),
        competencyId,
        level,
        source: 'OJT',
        note: note || `OJT: ${session.checklistName}`,
        evidence: { type: 'OJT', refId: session._id },
      })
      posted.push({ competencyId, level })
    }

    session.signOff = {
      signedBy: actor.id,
      signedAt: new Date(),
      note,
      postedCompetencies: posted,
    }
    await session.save()

    await auditLogRepository.record({
      actor: actor.id,
      action: 'ojt.signoff',
      entity: 'OjtSession',
      entityId: String(session._id),
      metadata: {
        traineeId: String(session.traineeId),
        observerId: String(session.observerId),
        checklist: session.checklistName,
        checklistVersion: session.checklistVersion,
        outcome: session.outcome,
        percent: session.score?.percent ?? 0,
        // Counter-signed rather than signed by the observer themselves is
        // the fact somebody will one day need out of this row.
        byObserver: sameId(session.observerId, actor.id),
        postedCompetencies: posted.map((entry) => `${entry.competencyId}:${entry.level}`),
      },
    })

    return toPublicSession(session.toObject())
  },

  /** Called off before it finished. A completed session is never cancelled. */
  async cancelSession(actor, id, { reason = '' } = {}) {
    const session = await OjtSession.findById(id)
    if (!session) throw ApiError.notFound('Session not found', 'OJT_SESSION_NOT_FOUND')
    assertMutable(session)
    session.status = 'CANCELLED'
    if (reason) session.observerNote = reason
    await session.save()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ojt.cancel',
      entity: 'OjtSession',
      entityId: String(session._id),
      metadata: { traineeId: String(session.traineeId), reason },
    })
    return toPublicSession(session.toObject())
  },

  canManage,
  canObserve,
}
