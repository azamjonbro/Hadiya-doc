// 13.1 — the competency catalogue and per-person levels.
//
// What is actually worth pinning here is the arithmetic, because every
// screen above it is a rendering of these four numbers:
//
//   required   the strictest requirement that matches the person
//   level      what was last recorded
//   effective  what that is worth *today* — an expired certificate is 0
//   gap        required − effective, floored at 0
//
// Plus the two rules that keep the record honest: history is bounded, and a
// manager cannot write a level for somebody outside their fence.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { PERMISSIONS, ROLE_SCOPES } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { Competency } from '../src/models/competency.model.js'
import { UserCompetency, HISTORY_LIMIT } from '../src/models/userCompetency.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import {
  competencyService,
  requiredLevelFor,
  effectiveLevel,
} from '../src/services/competencies/competency.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `Comp-${stamp}`
const OTHER_DEPT = `CompOther-${stamp}`
const POSITION = `Sotuvchi-${stamp}`
const BRANCH = `Filial-${stamp}`

let employeeRole
let manager
let seller
let outsider
let hrActor
let managerActor
const userIds = []
const competencyIds = []

const ladder = (count) =>
  Array.from({ length: count }, (_, index) => ({ value: index + 1, label: `L${index + 1}` }))

async function makeUser(name, extra = {}) {
  const user = await User.create({
    firstName: name,
    lastName: 'Test',
    fullName: `${name} Test`,
    jshshir: `41${userIds.length}${stamp}`,
    passwordHash: await hashPassword('CompetencyTest123!'),
    roleId: employeeRole._id,
    ...extra,
  })
  userIds.push(user._id)
  return user
}

async function makeCompetency(payload) {
  const competency = await competencyService.create(hrActor, {
    levels: ladder(4),
    ...payload,
  })
  competencyIds.push(new mongoose.Types.ObjectId(competency.id))
  return competency
}

const itemFor = (profile, code) => profile.items.find((item) => item.code === code)

describe('competencies (13.1)', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    manager = await makeUser('Rahbar', { department: DEPT, branch: BRANCH })
    seller = await makeUser('Sotuvchi', { department: DEPT, position: POSITION, branch: BRANCH })
    // Deliberately given neither the position nor the branch: they are the
    // person no requirement reaches and no manager may write about.
    outsider = await makeUser('Begona', { department: OTHER_DEPT })

    // The two callers the routes distinguish: HR writing the catalogue with
    // no fence, and a department manager who may only record levels for
    // their own people.
    hrActor = {
      id: String(manager._id),
      scope: ROLE_SCOPES.ALL,
      roleName: 'ADMIN',
      permissions: [PERMISSIONS.COMPETENCY_MANAGE, PERMISSIONS.COMPETENCY_ASSESS],
    }
    managerActor = {
      id: String(manager._id),
      scope: ROLE_SCOPES.DEPARTMENT,
      roleName: 'MANAGER',
      permissions: [PERMISSIONS.COMPETENCY_ASSESS],
    }
  })

  after(async () => {
    await Promise.all([
      UserCompetency.deleteMany({ userId: { $in: userIds } }),
      Competency.deleteMany({ _id: { $in: competencyIds } }),
      AuditLog.deleteMany({ actor: { $in: userIds } }),
    ])
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('what the job demands', () => {
    let byPosition
    let byDepartment
    let byBranch

    before(async () => {
      byPosition = await makeCompetency({
        code: `POS${stamp}`,
        name: 'E’tirozlar bilan ishlash',
        requirements: [{ scope: 'POSITION', value: POSITION, level: 3 }],
      })
      byDepartment = await makeCompetency({
        code: `DEP${stamp}`,
        name: 'Ichki tartib',
        requirements: [{ scope: 'DEPARTMENT', value: DEPT, level: 2 }],
      })
      byBranch = await makeCompetency({
        code: `BRA${stamp}`,
        name: 'Kassa apparati',
        requirements: [{ scope: 'BRANCH', value: BRANCH, level: 1 }],
      })
    })

    test('a POSITION requirement reaches whoever holds that position', async () => {
      const doc = await Competency.findById(byPosition.id).lean()
      assert.equal(requiredLevelFor(doc, seller), 3)
      // The manager has the department and the branch but not the position.
      assert.equal(requiredLevelFor(doc, manager), 0)
    })

    test('a DEPARTMENT requirement reaches the whole department', async () => {
      const doc = await Competency.findById(byDepartment.id).lean()
      assert.equal(requiredLevelFor(doc, seller), 2)
      assert.equal(requiredLevelFor(doc, manager), 2)
      assert.equal(requiredLevelFor(doc, outsider), 0)
    })

    test('a BRANCH requirement reaches the whole branch', async () => {
      const doc = await Competency.findById(byBranch.id).lean()
      assert.equal(requiredLevelFor(doc, manager), 1)
      assert.equal(requiredLevelFor(doc, outsider), 0)
    })

    test('the match is case-insensitive, so one job is not two requirements', async () => {
      const doc = await Competency.findById(byPosition.id).lean()
      assert.equal(requiredLevelFor(doc, { position: POSITION.toUpperCase() }), 3)
    })

    test('when several requirements match, the strictest wins', async () => {
      const both = await makeCompetency({
        code: `BOTH${stamp}`,
        name: 'Ikki talab',
        requirements: [
          { scope: 'DEPARTMENT', value: DEPT, level: 2 },
          { scope: 'POSITION', value: POSITION, level: 4 },
        ],
      })
      const doc = await Competency.findById(both.id).lean()
      // Averaging would let a department-wide floor quietly lower the bar
      // for a job that needs more.
      assert.equal(requiredLevelFor(doc, seller), 4)
    })
  })

  describe('gap arithmetic', () => {
    let competency

    before(async () => {
      competency = await makeCompetency({
        code: `GAP${stamp}`,
        name: 'Muzokara',
        requirements: [{ scope: 'POSITION', value: POSITION, level: 3 }],
      })
    })

    test('never assessed against a real requirement is MISSING, gap = required', async () => {
      const profile = await competencyService.forUser(seller._id)
      const item = itemFor(profile, `GAP${stamp}`)
      assert.equal(item.status, 'MISSING')
      assert.equal(item.level, null)
      assert.equal(item.gap, 3)
    })

    test('below the bar is a GAP of exactly the shortfall', async () => {
      await competencyService.assess(hrActor, {
        userId: seller._id,
        competencyId: competency.id,
        level: 1,
        source: 'MANAGER',
      })
      const item = itemFor(await competencyService.forUser(seller._id), `GAP${stamp}`)
      assert.equal(item.status, 'GAP')
      assert.equal(item.gap, 2)
    })

    test('at or above the bar the gap is 0, never negative', async () => {
      const result = await competencyService.assess(hrActor, {
        userId: seller._id,
        competencyId: competency.id,
        level: 4,
      })
      assert.equal(result.gap, 0)
      assert.equal(result.previousLevel, 1)
      const item = itemFor(await competencyService.forUser(seller._id), `GAP${stamp}`)
      assert.equal(item.status, 'MET')
      assert.equal(item.gap, 0)
    })

    test('a level that is not a rung on this ladder is refused', async () => {
      await assert.rejects(
        competencyService.assess(hrActor, { userId: seller._id, competencyId: competency.id, level: 9 }),
        (error) => error.code === 'COMPETENCY_LEVEL_OFF_SCALE'
      )
    })

    test('0 is a rung: "assessed, does not have it" is not the same as unassessed', async () => {
      const other = await makeCompetency({ code: `ZERO${stamp}`, name: 'Nolinchi' })
      const result = await competencyService.assess(hrActor, {
        userId: seller._id,
        competencyId: other.id,
        level: 0,
      })
      assert.equal(result.level, 0)
      const item = itemFor(await competencyService.forUser(seller._id), `ZERO${stamp}`)
      // No requirement matches it, so it is ASSESSED rather than a gap — but
      // it is present, which is the point.
      assert.equal(item.status, 'ASSESSED')
      assert.equal(item.level, 0)
    })

    test('role fit counts only what the job actually demands', async () => {
      const profile = await competencyService.forUser(outsider._id)
      // Nothing is required of them, so the honest answer is 100 — not 0,
      // which would bottom-rank everyone in a company that has not written
      // its requirements yet.
      assert.equal(profile.requiredCount, 0)
      assert.equal(profile.fitPercent, 100)
    })
  })

  describe('expiry', () => {
    let certificate

    before(async () => {
      certificate = await makeCompetency({
        code: `CERT${stamp}`,
        name: 'Yuk ko’targich guvohnomasi',
        levels: ladder(2),
        validityDays: 365,
        requirements: [{ scope: 'POSITION', value: POSITION, level: 2 }],
      })
    })

    test('an expiry date is stamped from the validity period at assessment time', async () => {
      const result = await competencyService.assess(hrActor, {
        userId: seller._id,
        competencyId: certificate.id,
        level: 2,
        source: 'CERTIFICATE',
      })
      assert.ok(result.expiresAt, 'a competency with a validity period has to stamp one')
      const days = Math.round((result.expiresAt - result.assessedAt) / 86400000)
      assert.equal(days, 365)
      const item = itemFor(await competencyService.forUser(seller._id), `CERT${stamp}`)
      assert.equal(item.status, 'MET')
      assert.equal(item.gap, 0)
    })

    test('a lapsed certificate is not still held', async () => {
      // Backdate it rather than wait a year.
      await UserCompetency.updateOne(
        { userId: seller._id, competencyId: certificate.id },
        { $set: { expiresAt: new Date(Date.now() - 86400000) } }
      )
      const row = await UserCompetency.findOne({ userId: seller._id, competencyId: certificate.id }).lean()
      // The recorded level is kept — "was level 2, lapsed in March" and
      // "never assessed" are different conversations — but it is worth 0.
      assert.equal(row.level, 2)
      assert.equal(effectiveLevel(row), 0)

      const item = itemFor(await competencyService.forUser(seller._id), `CERT${stamp}`)
      assert.equal(item.status, 'EXPIRED')
      assert.equal(item.level, 2)
      assert.equal(item.effectiveLevel, 0)
      assert.equal(item.gap, 2, 'an expired certificate has to count against the bar in full')
    })

    test('a competency with no validity period never expires', async () => {
      const row = await UserCompetency.findOne({ userId: seller._id, competencyId: competencyIds[0] }).lean()
      if (row) assert.equal(row.expiresAt, null)
      assert.equal(effectiveLevel({ level: 3, expiresAt: null }), 3)
    })

    test('the matrix reports the same expiry as the profile', async () => {
      const matrix = await competencyService.matrix({
        scopedUserIds: [String(seller._id)],
        competencyIds: [certificate.id],
      })
      const row = matrix.items.find((entry) => entry.userId === String(seller._id))
      assert.equal(row.cells[0].status, 'EXPIRED')
      assert.equal(row.cells[0].effectiveLevel, 0)
      assert.equal(row.cells[0].gap, 2)
    })
  })

  describe('history', () => {
    let competency

    before(async () => {
      competency = await makeCompetency({ code: `HIST${stamp}`, name: 'Tarix' })
    })

    test('the newest entry is first and the one behind it is the previous level', async () => {
      await competencyService.assess(hrActor, { userId: seller._id, competencyId: competency.id, level: 1 })
      const result = await competencyService.assess(hrActor, {
        userId: seller._id,
        competencyId: competency.id,
        level: 3,
        note: 'ikkinchi',
      })
      assert.equal(result.previousLevel, 1, 'history[1] is what the before/after comparison subtracts')
      const row = await UserCompetency.findOne({ userId: seller._id, competencyId: competency.id }).lean()
      assert.equal(row.history[0].level, 3)
      assert.equal(row.history[0].note, 'ikkinchi')
      assert.equal(row.history[1].level, 1)
    })

    test('history is bounded — it cannot grow without limit', async () => {
      // Two are already there; push well past the cap.
      for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
        await competencyService.assess(hrActor, {
          userId: seller._id,
          competencyId: competency.id,
          level: (index % 4) + 1,
        })
      }
      const row = await UserCompetency.findOne({ userId: seller._id, competencyId: competency.id }).lean()
      assert.equal(row.history.length, HISTORY_LIMIT)
      // Trimmed from the tail, so the newest survive.
      assert.equal(row.history[0].level, row.level)
    })
  })

  describe('the fence', () => {
    let competency

    before(async () => {
      competency = await makeCompetency({ code: `SCOPE${stamp}`, name: 'Chegara' })
    })

    test('a manager may record a level for their own person', async () => {
      const result = await competencyService.assess(managerActor, {
        userId: seller._id,
        competencyId: competency.id,
        level: 2,
      })
      assert.equal(result.level, 2)
    })

    test('a manager may not record a level for somebody outside their scope', async () => {
      await assert.rejects(
        competencyService.assess(managerActor, {
          userId: outsider._id,
          competencyId: competency.id,
          level: 4,
        }),
        (error) => {
          assert.equal(error.statusCode, 403)
          assert.equal(error.code, 'COMPETENCY_SCOPE_FORBIDDEN')
          return true
        }
      )
      // And nothing was written — a refused assessment must not leave a row
      // behind for the matrix to render.
      const row = await UserCompetency.findOne({ userId: outsider._id, competencyId: competency.id })
      assert.equal(row, null)
    })

    test('the matrix only returns the people the caller is fenced to', async () => {
      const matrix = await competencyService.matrix({ scopedUserIds: [String(seller._id), String(manager._id)] })
      const ids = matrix.items.map((entry) => entry.userId)
      assert.ok(ids.includes(String(seller._id)))
      assert.ok(!ids.includes(String(outsider._id)), 'a fenced caller must not see outside the fence')
    })

    test('an unfenced caller sees the outsider too', async () => {
      const matrix = await competencyService.matrix({ department: OTHER_DEPT })
      assert.ok(matrix.items.some((entry) => entry.userId === String(outsider._id)))
    })
  })

  describe('the catalogue', () => {
    test('a duplicate code is refused', async () => {
      await assert.rejects(
        competencyService.create(hrActor, {
          code: `GAP${stamp}`,
          name: 'Takror',
          levels: ladder(3),
        }),
        (error) => error.code === 'COMPETENCY_CODE_TAKEN'
      )
    })

    test('the scale cannot be shortened under levels somebody already holds', async () => {
      const held = await UserCompetency.findOne({ userId: seller._id, level: { $gte: 3 } }).lean()
      assert.ok(held, 'the fixture needs somebody sitting at level 3 or above')
      await assert.rejects(
        competencyService.update(hrActor, held.competencyId, { levels: ladder(2) }),
        (error) => error.code === 'COMPETENCY_SCALE_IN_USE'
      )
    })

    test('a competency somebody holds cannot be deleted', async () => {
      const held = await UserCompetency.findOne({ userId: seller._id }).lean()
      await assert.rejects(
        competencyService.remove(hrActor, held.competencyId),
        (error) => error.code === 'COMPETENCY_IN_USE'
      )
    })

    test('an archived competency disappears from a non-manager’s list', async () => {
      const archived = await makeCompetency({ code: `ARCH${stamp}`, name: 'Arxiv' })
      await competencyService.update(hrActor, archived.id, { status: 'ARCHIVED' })

      const asManager = await competencyService.list(managerActor, {})
      assert.ok(!asManager.some((entry) => entry.code === `ARCH${stamp}`))
      const asHr = await competencyService.list(hrActor, { status: 'ARCHIVED' })
      assert.ok(asHr.some((entry) => entry.code === `ARCH${stamp}`))
    })

    test('a requirement above the top rung is refused', async () => {
      const shallow = await makeCompetency({ code: `SHAL${stamp}`, name: 'Past narvon', levels: ladder(2) })
      await assert.rejects(
        competencyService.update(hrActor, shallow.id, {
          requirements: [{ scope: 'DEPARTMENT', value: DEPT, level: 4 }],
        }),
        (error) => error.code === 'COMPETENCY_REQUIREMENT_OFF_SCALE'
      )
      // The refusal must not have half-applied.
      const doc = await Competency.findById(shallow.id).lean()
      assert.equal(doc.requirements.length, 0)
    })

    test('the write is audited — a level decides shifts and promotions', async () => {
      const entry = await AuditLog.findOne({ actor: manager._id, action: 'competency.assess' }).sort({ _id: -1 }).lean()
      assert.ok(entry, 'an assessment has to leave a trail')
      assert.ok(entry.metadata.competency)
      assert.equal(typeof entry.metadata.level, 'number')
    })
  })
})
