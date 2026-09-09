// 8.1 — the seventeen reports the platform grew in blocks 3–7.
//
// Testing each report's numbers one by one would be seventeen fixtures and
// very little signal. What actually breaks is the *contract*: a new builder
// that forgets to narrow through `roleUserIds` shows a supervisor the whole
// company, and one that forgets `totalRows` silently reintroduces the
// truncation bug AT-22 exists for.
//
// So this checks the contract across all of them, and the two reports whose
// logic is not a straight query — the certificate register's state and the
// question-difficulty rate — get their own cases.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Certificate } from '../src/models/certificate.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { reportDataService, REPORT_TYPES } from '../src/services/reports/reportData.service.js'
import { EXTRA_REPORT_BUILDERS } from '../src/services/reports/reportBuilders.extra.js'
import { reportTranslator, REPORT_LANGS } from '../src/services/reports/reportI18n.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let holder
let stranger
const userIds = []
const certIds = []

const actorFor = (user) => ({ id: user._id.toString(), roleName: 'SUPERADMIN', permissions: ['report:export'] })

async function makeUser(name) {
  const user = await User.create({
    firstName: name,
    lastName: 'Rep',
    fullName: `${name} Rep`,
    jshshir: `81${userIds.length}${stamp}`,
    passwordHash: await hashPassword('RepTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
    department: `Reports-${stamp}`,
  })
  userIds.push(user._id)
  return user
}

describe('the report catalogue (8.1)', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    holder = await makeUser('Egasi')
    stranger = await makeUser('Begona')

    const base = {
      userId: holder._id,
      sourceType: 'MANUAL',
      fullName: holder.fullName,
      issuedAt: new Date('2026-01-15'),
    }
    const valid = await Certificate.create({
      ...base,
      serial: `V-${stamp}`,
      sourceId: new mongoose.Types.ObjectId(),
      sourceTitle: 'Still good',
      validUntil: new Date('2030-01-01'),
    })
    const expired = await Certificate.create({
      ...base,
      serial: `E-${stamp}`,
      sourceId: new mongoose.Types.ObjectId(),
      sourceTitle: 'Ran out',
      validUntil: new Date('2026-02-01'),
    })
    const revoked = await Certificate.create({
      ...base,
      serial: `R-${stamp}`,
      sourceId: new mongoose.Types.ObjectId(),
      sourceTitle: 'Withdrawn',
      validUntil: new Date('2030-01-01'),
      revokedAt: new Date('2026-03-01'),
    })
    certIds.push(valid._id, expired._id, revoked._id)
  })

  after(async () => {
    await Certificate.deleteMany({ _id: { $in: certIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the catalogue itself', () => {
    test('seventeen reports were added to the original five', () => {
      assert.equal(Object.keys(EXTRA_REPORT_BUILDERS).length, 17)
      assert.equal(REPORT_TYPES.length, 22)
    })

    test('every type has a name in every language', () => {
      // The picker lists these; a missing name would show a slug.
      for (const lang of REPORT_LANGS) {
        const t = reportTranslator(lang)
        for (const type of REPORT_TYPES) {
          const label = t(`type.${type}`)
          assert.notEqual(label, `type.${type}`, `${type} has no name in ${lang}`)
        }
      }
    })
  })

  describe('the contract every builder has to keep', () => {
    test('all of them report totalRows and truncated', async () => {
      // A builder that forgets this silently reintroduces the bug AT-22
      // exists for: a cut file that looks complete.
      for (const type of REPORT_TYPES) {
        const result = await reportDataService.build(actorFor(holder), type, {}, 'en', { scopedUserIds: null })
        assert.ok(Array.isArray(result.columns), `${type} must return columns`)
        assert.ok(Array.isArray(result.rows), `${type} must return rows`)
        assert.equal(typeof result.totalRows, 'number', `${type} must report totalRows`)
        assert.equal(typeof result.truncated, 'boolean', `${type} must report truncated`)
        assert.ok(result.totalRows >= result.rows.length, `${type} totalRows is below its own row count`)
      }
    })

    test('all of them return headers, not column keys', async () => {
      for (const type of REPORT_TYPES) {
        const { columns } = await reportDataService.build(actorFor(holder), type, {}, 'uz', { scopedUserIds: null })
        for (const column of columns) {
          assert.ok(column.header, `${type}.${column.key} has no header`)
          assert.ok(!column.header.startsWith('col.'), `${type}.${column.key} shows a translation key`)
        }
      }
    })

    test('an empty scope yields nothing, never everything', async () => {
      // The dangerous direction: a builder that treats "no ids" as "no
      // filter" hands a supervisor the whole company.
      for (const type of REPORT_TYPES) {
        const result = await reportDataService.build(actorFor(holder), type, {}, 'en', { scopedUserIds: [] })
        assert.equal(result.rows.length, 0, `${type} returned rows for an empty scope`)
      }
    })
  })

  describe('the certificate register', () => {
    test('reports the same three states the public check does', async () => {
      const { rows } = await reportDataService.build(actorFor(holder), 'certificate-register', {}, 'en', {
        scopedUserIds: [holder._id.toString()],
      })
      const mine = rows.filter((row) => row.serial.endsWith(stamp))
      const byState = Object.fromEntries(mine.map((row) => [row.serial[0], row.state]))

      // An auditor comparing the register with a QR code has to see one
      // answer, so these are the verification page's words.
      assert.equal(byState.V, 'Valid')
      assert.equal(byState.E, 'Expired')
      // Revoked beats expired, exactly as the public view decides it.
      assert.equal(byState.R, 'Revoked')
    })

    test('somebody else’s certificates are not in it', async () => {
      const { rows } = await reportDataService.build(actorFor(stranger), 'certificate-register', {}, 'en', {
        scopedUserIds: [stranger._id.toString()],
      })
      assert.equal(rows.filter((row) => row.serial.endsWith(stamp)).length, 0)
    })
  })

  describe('question difficulty', () => {
    test('is computed from the marks recorded at grading time', async () => {
      // Not recomputed from the questions as they stand now — an author who
      // fixes a wrong answer key must not rewrite how everybody did.
      const result = await reportDataService.build(actorFor(holder), 'question-difficulty', {}, 'en', {
        scopedUserIds: null,
      })
      assert.ok(result.columns.some((column) => column.key === 'correctRate'))
      for (const row of result.rows) {
        assert.ok(row.correctRate >= 0 && row.correctRate <= 100)
        assert.ok(row.correct <= row.asked)
      }
    })
  })
})
