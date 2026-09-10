// 13.3 — on-the-job training.
//
// The four things that have to be true, and are the reason this file
// exists rather than a handful of happy-path calls:
//
//   1. only the named observer records — a signature somebody else could
//      have produced says nothing about who was standing there;
//   2. a completed session is closed, because a result that changes after
//      it has been read is not a result;
//   3. editing a checklist does not rewrite a finished session — the
//      session carries its own copy, and that is the whole versioning
//      design;
//   4. what was not observed is outside the fraction, not a fail.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { OjtChecklist } from '../src/models/ojtChecklist.model.js'
import { OjtSession } from '../src/models/ojtSession.model.js'
import { OjtObservation } from '../src/models/ojtObservation.model.js'
import { Competency } from '../src/models/competency.model.js'
import { UserCompetency } from '../src/models/userCompetency.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { ojtService, computeScore } from '../src/services/ojt/ojt.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `Ojt-${stamp}`

// `scope` is what a real token carries (2.2). It matters here because
// sign-off posts to the competency matrix, and that write is fenced on the
// signer's org scope — an observer from another department may run the
// session but not move somebody's level.
const MANAGER = { id: null, scope: 'DEPARTMENT', permissions: ['ojt:manage', 'competency:manage', 'competency:assess'] }
const OBSERVER = { id: null, scope: 'DEPARTMENT', permissions: ['ojt:observe'] }
const OTHER_OBSERVER = { id: null, scope: 'DEPARTMENT', permissions: ['ojt:observe'] }

let employeeRole
let trainee
let competency
let checklist
let session
const userIds = []

async function makeUser(name, department = DEPT) {
  const user = await User.create({
    firstName: name,
    lastName: 'Ojt',
    fullName: `${name} Ojt`,
    jshshir: `47${userIds.length}${stamp}`,
    passwordHash: await hashPassword('OjtTest123!'),
    roleId: employeeRole._id,
    department,
  })
  userIds.push(user._id)
  return user
}

const itemByTitle = (row, title) => row.items.find((item) => item.title === title)

describe('ojt (13.3)', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    const [managerUser, observerUser, otherUser, traineeUser] = [
      await makeUser('Rahbar'),
      await makeUser('Kuzatuvchi'),
      await makeUser('Begona', `Other-${stamp}`),
      await makeUser('Shogird'),
    ]
    MANAGER.id = String(managerUser._id)
    OBSERVER.id = String(observerUser._id)
    OTHER_OBSERVER.id = String(otherUser._id)
    trainee = traineeUser

    competency = await Competency.create({
      code: `OJT${stamp}`,
      name: 'Pressni xavfsiz ishlatish',
      levels: [
        { value: 1, label: 'Kuzatuv ostida' },
        { value: 2, label: 'Mustaqil' },
        { value: 3, label: 'O‘rgata oladi' },
      ],
      createdBy: MANAGER.id,
    })
  })

  after(async () => {
    const sessionIds = (await OjtSession.find({ traineeId: trainee._id }).select('_id').lean()).map((row) => row._id)
    await Promise.all([
      OjtObservation.deleteMany({ sessionId: { $in: sessionIds } }),
      OjtSession.deleteMany({ _id: { $in: sessionIds } }),
      OjtChecklist.deleteMany({ createdBy: MANAGER.id }),
      UserCompetency.deleteMany({ competencyId: competency._id }),
      AuditLog.deleteMany({ entityId: { $in: sessionIds.map(String) } }),
    ])
    await Competency.deleteOne({ _id: competency._id })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('scoring arithmetic', () => {
    test('what was not observed is outside the fraction, not a fail', () => {
      // A shift does not throw up every situation on the list. Counting the
      // ones it did not as failures punishes the trainee for the day's work.
      const result = computeScore(
        [
          { required: true, weight: 2, result: 'PASS' },
          { required: false, weight: 1, result: 'FAIL' },
          { required: false, weight: 1, result: 'NOT_OBSERVED' },
        ],
        60
      )
      // 2 of the 3 weight actually judged — not 2 of 4.
      assert.equal(result.score.assessedWeight, 3)
      assert.equal(result.score.earnedWeight, 2)
      assert.equal(result.score.percent, 67)
      assert.equal(result.score.notObserved, 1)
      assert.equal(result.outcome, 'PASS')
    })

    test('a failed required item fails the session however good the rest was', () => {
      const result = computeScore(
        [
          { required: true, weight: 1, result: 'FAIL' },
          { required: false, weight: 9, result: 'PASS' },
        ],
        60
      )
      assert.equal(result.score.percent, 90)
      assert.equal(result.requiredMet, false)
      assert.equal(result.outcome, 'FAIL')
    })

    test('an empty session is 0, not NaN and not a pass', () => {
      const result = computeScore([{ required: false, weight: 1, result: null }], 60)
      assert.equal(result.score.percent, 0)
      assert.equal(result.outcome, 'FAIL')
    })
  })

  describe('checklists', () => {
    test('a new checklist is a draft, whatever was asked for', async () => {
      const created = await ojtService.createChecklist(MANAGER, {
        name: `Press ${stamp}`,
        status: 'ACTIVE',
        passThresholdPercent: 60,
        items: [
          { title: 'Quvvatni uzish', required: true, weight: 2, order: 0, competencyId: String(competency._id), competencyLevel: 3 },
          { title: 'Ko‘rsatkichni yozish', required: false, weight: 1, order: 1 },
          { title: 'Favqulodda to‘xtatish', required: false, weight: 1, order: 2 },
        ],
      })
      assert.equal(created.status, 'DRAFT')
      assert.equal(created.version, 1)
      checklist = await ojtService.updateChecklist(MANAGER, created.id, { status: 'ACTIVE' })
      assert.equal(checklist.status, 'ACTIVE')
      // Publishing is not a new edition of the list.
      assert.equal(checklist.version, 1)
    })

    test('a level that is not on the competency’s scale is refused at design time', async () => {
      // Caught here rather than at sign-off: the session’s items are frozen
      // copies, so an off-scale level found later leaves an observer with a
      // session that can never be signed.
      await assert.rejects(
        () =>
          ojtService.createChecklist(MANAGER, {
            name: `Bad ${stamp}`,
            items: [{ title: 'X', competencyId: String(competency._id), competencyLevel: 7 }],
          }),
        (error) => error.code === 'COMPETENCY_LEVEL_OFF_SCALE'
      )
    })
  })

  describe('a session', () => {
    test('is scheduled with a frozen copy of the checklist', async () => {
      session = await ojtService.createSession(MANAGER, {
        checklistId: checklist.id,
        traineeId: String(trainee._id),
        observerId: OBSERVER.id,
        location: 'Sex 3, press 2',
      })
      assert.equal(session.status, 'SCHEDULED')
      assert.equal(session.checklistVersion, 1)
      assert.equal(session.items.length, 3)
      assert.equal(session.passThresholdPercent, 60)
    })

    test('an observer cannot record on somebody else’s session', async () => {
      await assert.rejects(
        () =>
          ojtService.recordObservation(OTHER_OBSERVER, session.id, itemByTitle(session, 'Quvvatni uzish').itemId, {
            result: 'PASS',
          }),
        (error) => error.code === 'NOT_SESSION_OBSERVER' && error.statusCode === 403
      )
      // Nor may an OJT manager record in the observer's name.
      await assert.rejects(
        () =>
          ojtService.recordObservation(MANAGER, session.id, itemByTitle(session, 'Quvvatni uzish').itemId, {
            result: 'PASS',
          }),
        (error) => error.code === 'NOT_SESSION_OBSERVER'
      )
    })

    test('the first observation starts it, so the form works with no signal', async () => {
      const result = await ojtService.recordObservation(
        OBSERVER,
        session.id,
        itemByTitle(session, 'Quvvatni uzish').itemId,
        { result: 'PASS', note: 'Ikki marta tekshirdi' }
      )
      assert.equal(result.result, 'PASS')
      const stored = await OjtSession.findById(session.id).lean()
      assert.equal(stored.status, 'IN_PROGRESS')
      assert.ok(stored.startedAt)
    })

    test('recording the same item twice overwrites the verdict — a replay cannot double-count', async () => {
      const itemId = itemByTitle(session, 'Ko‘rsatkichni yozish').itemId
      await ojtService.recordObservation(OBSERVER, session.id, itemId, { result: 'PASS' })
      await ojtService.recordObservation(OBSERVER, session.id, itemId, { result: 'FAIL', note: 'Unutdi' })
      const rows = await OjtObservation.find({ sessionId: session.id, itemId }).lean()
      assert.equal(rows.length, 1)
      assert.equal(rows[0].result, 'FAIL')
    })

    test('a required item still unobserved blocks completion', async () => {
      const second = await ojtService.createSession(MANAGER, {
        checklistId: checklist.id,
        traineeId: String(trainee._id),
        observerId: OBSERVER.id,
      })
      await assert.rejects(
        () => ojtService.completeSession(OBSERVER, second.id),
        (error) => error.code === 'OJT_REQUIRED_ITEMS_PENDING'
      )
      await ojtService.cancelSession(MANAGER, second.id)
    })

    test('completing freezes the score', async () => {
      await ojtService.recordObservation(OBSERVER, session.id, itemByTitle(session, 'Favqulodda to‘xtatish').itemId, {
        result: 'NOT_OBSERVED',
        note: 'Smenada bunday holat bo‘lmadi',
      })
      const completed = await ojtService.completeSession(OBSERVER, session.id, { note: 'Yaxshi ishladi' })
      assert.equal(completed.status, 'COMPLETED')
      // PASS(2) out of the 3 weight judged; the unobserved item is not in
      // the denominator, so 67 and not 50.
      assert.equal(completed.score.percent, 67)
      assert.equal(completed.outcome, 'PASS')
      assert.ok(completed.completedAt)
    })

    test('a completed session is immutable', async () => {
      await assert.rejects(
        () =>
          ojtService.recordObservation(OBSERVER, session.id, itemByTitle(session, 'Quvvatni uzish').itemId, {
            result: 'FAIL',
          }),
        (error) => error.code === 'OJT_SESSION_COMPLETED' && error.statusCode === 409
      )
      await assert.rejects(
        () => ojtService.completeSession(OBSERVER, session.id),
        (error) => error.code === 'OJT_SESSION_COMPLETED'
      )
      await assert.rejects(
        () => ojtService.cancelSession(MANAGER, session.id),
        (error) => error.code === 'OJT_SESSION_COMPLETED'
      )
    })
  })

  describe('editing the checklist afterwards', () => {
    test('bumps the version and leaves the finished session alone', async () => {
      const edited = await ojtService.updateChecklist(MANAGER, checklist.id, {
        items: [
          {
            title: 'Quvvatni uzish va bloklash',
            required: true,
            weight: 5,
            order: 0,
            competencyId: String(competency._id),
            competencyLevel: 3,
          },
          { title: 'Yangi band', required: false, weight: 1, order: 1 },
        ],
      })
      assert.equal(edited.version, 2)

      const stored = await ojtService.getSession(OBSERVER, session.id)
      // Same three items, same wording, same weights, same score. The
      // session carries its own copy precisely so this holds.
      assert.equal(stored.items.length, 3)
      assert.equal(stored.checklistVersion, 1)
      assert.ok(itemByTitle(stored, 'Quvvatni uzish'), 'the March wording survives a June edit')
      assert.equal(itemByTitle(stored, 'Quvvatni uzish').weight, 2)
      assert.equal(stored.score.percent, 67)
      assert.equal(stored.outcome, 'PASS')
    })

    test('a checklist that has been used cannot be deleted', async () => {
      await assert.rejects(
        () => ojtService.removeChecklist(MANAGER, checklist.id),
        (error) => error.code === 'OJT_CHECKLIST_IN_USE'
      )
    })
  })

  describe('sign-off', () => {
    test('posts the level of every passed item to the skill matrix', async () => {
      const signed = await ojtService.signOff(OBSERVER, session.id, { note: 'Tasdiqlayman' })
      assert.ok(signed.signedAt)
      assert.equal(signed.postedCompetencies.length, 1)

      const row = await UserCompetency.findOne({ userId: trainee._id, competencyId: competency._id }).lean()
      assert.ok(row, 'the signature has to reach the matrix, or OJT is a note in a drawer')
      assert.equal(row.level, 3)
      assert.equal(row.source, 'OJT')
      assert.equal(row.evidence.type, 'OJT')
      assert.equal(String(row.evidence.refId), String(session.id))
      assert.equal(String(row.assessedBy), OBSERVER.id)
    })

    test('is audited', async () => {
      const entry = await AuditLog.findOne({ action: 'ojt.signoff', entityId: String(session.id) }).lean()
      assert.ok(entry, 'a signature that decides who runs a machine has to be traceable')
      assert.equal(entry.metadata.outcome, 'PASS')
      assert.equal(entry.metadata.byObserver, true)
    })

    test('cannot be signed twice', async () => {
      await assert.rejects(
        () => ojtService.signOff(OBSERVER, session.id, {}),
        (error) => error.code === 'OJT_ALREADY_SIGNED'
      )
    })

    test('an unfinished session cannot be signed', async () => {
      const fresh = await ojtService.createSession(MANAGER, {
        checklistId: checklist.id,
        traineeId: String(trainee._id),
        observerId: OBSERVER.id,
      })
      await assert.rejects(
        () => ojtService.signOff(OBSERVER, fresh.id, {}),
        (error) => error.code === 'OJT_SESSION_NOT_COMPLETED'
      )
    })

    test('an observer outside the trainee’s scope is refused before anything is written', async () => {
      // Being named as the observer does not widen the org scope that
      // guards the competency matrix. Refused up front so the session is
      // left COMPLETED-and-unsigned — a state a manager can counter-sign —
      // rather than half-posted.
      const outside = await ojtService.createSession(MANAGER, {
        checklistId: checklist.id,
        traineeId: String(trainee._id),
        observerId: OTHER_OBSERVER.id,
      })
      // The session was scheduled after the edit, so it carries edition 2.
      assert.equal(outside.checklistVersion, 2)
      const linked = itemByTitle(outside, 'Quvvatni uzish va bloklash').itemId
      await ojtService.recordObservation(OTHER_OBSERVER, outside.id, linked, { result: 'PASS' })
      await ojtService.completeSession(OTHER_OBSERVER, outside.id)
      await assert.rejects(
        () => ojtService.signOff(OTHER_OBSERVER, outside.id, {}),
        (error) => error.code === 'OJT_SIGNOFF_SCOPE_FORBIDDEN'
      )
      const stored = await OjtSession.findById(outside.id).lean()
      assert.equal(stored.signOff?.signedAt ?? null, null)
    })
  })

  describe('who sees what', () => {
    test('an observer’s list is their own, even if they ask for everything', async () => {
      // The traineeId filter is ignored for somebody without ojt:manage: a
      // filter the client chooses is not a fence.
      const result = await ojtService.listSessions(OTHER_OBSERVER, { traineeId: String(trainee._id) })
      assert.ok(result.items.length > 0)
      assert.ok(result.items.every((row) => row.observerId === OTHER_OBSERVER.id))
      const asManager = await ojtService.listSessions(MANAGER, { traineeId: String(trainee._id) })
      assert.ok(asManager.items.length > result.items.length)
    })

    test('a stranger cannot read the session', async () => {
      await assert.rejects(
        () => ojtService.getSession(OTHER_OBSERVER, session.id),
        (error) => error.code === 'OJT_SESSION_FORBIDDEN'
      )
    })

    test('the trainee can read their own', async () => {
      // Being assessed and not being allowed to read the assessment is how
      // an OJT record becomes something people distrust.
      const view = await ojtService.getSession({ id: String(trainee._id), permissions: [] }, session.id)
      assert.equal(view.id, String(session.id))
    })
  })
})
