// AT-12 and AT-13 — the public verification endpoint, over HTTP.
//
//   AT-12  GET /public/certificates/:serial with no token
//          -> 200 with the name, the course, the date and the status; no
//             jshshir, no email, no ids, no PDF link; unknown serial 404;
//             more than ten a minute from one address, 429
//   AT-13  a revoked certificate still answers, and says REVOKED
//
// The unit-level shape is asserted in certificates.test.js. This file is
// about the route: that it is reachable *without* authenticate having run,
// which is a property of where it is mounted and cannot be tested by
// calling the service.
//
// Runs against a live backend (TEST_BASE_URL) for the same reason
// security.test.js does — a mounted-in-the-wrong-place route passes every
// mock.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Certificate } from '../src/models/certificate.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { generateSerial } from '../src/services/certificates/certificate.service.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const stamp = String(Date.now()).slice(-9)

let learner
let valid
let revoked

// Each run presents its own client address.
//
// The endpoint is rate limited per IP, and without this a second run of the
// suite inside the same minute inherits the bucket the first one emptied —
// every assertion then fails with 429 for a reason that has nothing to do
// with the code. The backend trusts exactly one proxy hop (app.js), which
// is the role the test is playing here.
const CLIENT_IP = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
const THROTTLE_IP = `198.51.100.${Math.floor(Math.random() * 200) + 1}`

async function verify(serial, ip = CLIENT_IP) {
  // Deliberately no Authorization header and no cookie: this is the whole
  // point of the endpoint.
  const res = await fetch(`${BASE_URL}/public/certificates/${serial}`, {
    headers: { 'X-Forwarded-For': ip },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

describe('AT-12 · public certificate verification', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    learner = await User.create({
      firstName: 'Verify',
      lastName: 'Target',
      fullName: 'Verify Target',
      jshshir: `41${stamp}`,
      email: `verify.${stamp}@example.com`,
      passwordHash: await hashPassword('VerifyTest123!'),
      roleId: employeeRole._id,
      department: 'Verification',
    })

    valid = await Certificate.create({
      serial: generateSerial(),
      userId: learner._id,
      sourceType: 'MANUAL',
      sourceId: new mongoose.Types.ObjectId(),
      fullName: learner.fullName,
      sourceTitle: 'Industrial safety',
      issuedAt: new Date('2026-03-01'),
      pdfKey: 'certificates/should-not-be-exposed.pdf',
    })

    revoked = await Certificate.create({
      serial: generateSerial(),
      userId: learner._id,
      sourceType: 'MANUAL',
      sourceId: new mongoose.Types.ObjectId(),
      fullName: learner.fullName,
      sourceTitle: 'Withdrawn training',
      issuedAt: new Date('2026-03-01'),
      revokedAt: new Date('2026-04-01'),
      revokedReason: 'Issued against the wrong course',
    })
  })

  after(async () => {
    await Certificate.deleteMany({ userId: learner._id })
    await User.deleteOne({ _id: learner._id })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  test('answers a valid serial with no token at all', async () => {
    const { status, body } = await verify(valid.serial)
    assert.equal(status, 200)
    const shown = body.data.certificate
    assert.equal(shown.serial, valid.serial)
    assert.equal(shown.fullName, 'Verify Target')
    assert.equal(shown.title, 'Industrial safety')
    assert.equal(shown.status, 'VALID')
    assert.ok(shown.issuedAt, 'the issue date is what makes the answer useful')
  })

  test('carries nothing that identifies the account behind the name', async () => {
    const { status, body } = await verify(valid.serial)
    // Asserted so this cannot pass on an error body, which carries no PII
    // either and would make the check meaningless.
    assert.equal(status, 200)
    // Checked against the serialised body rather than key by key: a field
    // added later that happens to carry the id would slip past a key list.
    const raw = JSON.stringify(body)
    assert.ok(!raw.includes(learner.jshshir), 'the national id must never appear')
    assert.ok(!raw.includes(learner.email), 'the email must never appear')
    assert.ok(!raw.includes(String(learner._id)), 'the user id must never appear')
    assert.ok(!raw.includes('should-not-be-exposed'), 'the storage key must never appear')
    assert.ok(!raw.includes('Verification'), 'the department must never appear')
  })

  test('a revoked certificate answers, and says so (AT-13)', async () => {
    const { status, body } = await verify(revoked.serial)
    assert.equal(status, 200)
    assert.equal(body.data.certificate.status, 'REVOKED')
    assert.ok(body.data.certificate.revokedAt, 'when it was withdrawn is part of the answer')
    // The reason is internal: it may name a person or an incident, and the
    // enquirer only needs to know the certificate is not good.
    assert.ok(!JSON.stringify(body).includes('wrong course'))
  })

  test('an unknown serial is a plain 404', async () => {
    const { status, body } = await verify('2026-ZZZZZ-ZZZZZ')
    assert.equal(status, 404)
    assert.equal(body.success, false)
  })

  test('the serial is matched case-insensitively — it gets typed off paper', async () => {
    const { status } = await verify(valid.serial.toLowerCase())
    assert.equal(status, 200)
  })

  test('more than ten a minute from one address is refused', async () => {
    // From its own address, so the count starts clean: the eleventh request
    // is the first that may be refused. Asserted as "429 arrives within a
    // dozen tries" rather than exactly on the eleventh, because the window
    // is wall-clock and a slow run can roll into the next minute.
    let sawTooMany = false
    for (let i = 0; i < 12; i += 1) {
      const { status } = await verify(valid.serial, THROTTLE_IP)
      if (status === 429) {
        sawTooMany = true
        break
      }
    }
    assert.ok(sawTooMany, 'the public endpoint must be rate limited (AT-12)')
  })
})
