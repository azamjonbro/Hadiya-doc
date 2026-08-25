// Integration + unit test suite for daily face verification (spec §23).
// Same approach as test/security.test.js: runs against a LIVE backend
// (TEST_BASE_URL, default http://localhost:4000/api/v1) and a real Mongo,
// not mocks — this is a security-critical feature and a mock would quietly
// stop testing the properties that matter (real RBAC, real rate limiting,
// a real Mongo-backed lockout).
//
// Run with: npm test  (from backend/)
//
// One real limitation: there is no photo of an actual face available to
// this suite (no camera, no bundled image asset), so the "does a genuine
// photo of the enrolled person pass" path cannot be exercised end-to-end
// here — faceEmbeddingService.similarity() is unit-tested directly instead
// (pure vector math, no image needed), and every failure path is exercised
// with a tiny synthetic PNG that decodes fine but contains no face.
//
// The login-gate and video-playback-gate integration tests only run when
// this suite is invoked against a backend started with
// FACE_VERIFICATION_ENABLED=true and FACE_VERIFICATION_REQUIRED=true (set
// TEST_FACE_GATE_ENABLED=true when running npm test to opt in) — the flags
// are read once at server boot, in a different process than this test file,
// so there is no way to flip them from here. They stay off by default so
// `npm test` against a normal dev boot doesn't fail on a feature that boot
// deliberately left disabled.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { connectDatabase, disconnectDatabase } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { FaceProfile } from '../src/models/faceProfile.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { isSameLocalDay, localDateKey } from '../src/utils/timezone.js'
import { faceEmbeddingService } from '../src/services/face/faceEmbedding.service.js'
import { faceProfileRepository } from '../src/repositories/faceProfile.repository.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const GATE_ENABLED = process.env.TEST_FACE_GATE_ENABLED === 'true'
const TEST_PASSWORD = 'FaceTest123!'

// A syntactically valid 1x1 PNG — enough to pass MIME/decode, guaranteed to
// contain zero faces. Stands in for "not a face" across every failure test.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    // non-JSON response — callers that expect one assert on status instead
  }
  return { status: res.status, headers: res.headers, body }
}

function multipartWithFile(fieldName, extraFields = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(extraFields)) form.append(key, value)
  form.append(fieldName, new Blob([BLANK_PNG], { type: 'image/png' }), 'frame.png')
  return form
}

async function apiForm(path, form, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, method: opts.method ?? 'POST', body: form })
  let body = null
  try {
    body = await res.json()
  } catch {
    // ignore
  }
  return { status: res.status, headers: res.headers, body }
}

async function login(identifier, password) {
  const { status, body } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
  assert.equal(status, 200, `login failed for ${identifier}: ${JSON.stringify(body)}`)
  return body.data.accessToken
}

let roleSuperAdmin, roleEmployee
let superAdmin, employee, otherEmployee
let tokenSuperAdmin, tokenEmployee, tokenOther
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
const cleanupUserIds = []

let jshshirCounter = 0
const runDigits = suffix.replace(/\D/g, '').slice(-9)
function testJshshir() {
  jshshirCounter += 1
  return `8${runDigits}${String(jshshirCounter).padStart(4, '0')}`
}

before(async () => {
  await connectDatabase()

  roleSuperAdmin = await Role.findOne({ name: 'SUPERADMIN' })
  roleEmployee = await Role.findOne({ name: 'EMPLOYEE' })
  assert.ok(roleSuperAdmin && roleEmployee, 'SUPERADMIN/EMPLOYEE roles must be seeded before running this suite')

  const passwordHash = await hashPassword(TEST_PASSWORD)

  superAdmin = await User.create({
    fullName: 'Face Test SuperAdmin',
    jshshir: testJshshir(),
    email: `facetest_sa_${suffix}@example.com`,
    passwordHash,
    roleId: roleSuperAdmin._id,
    isActive: true,
  })
  employee = await User.create({
    fullName: 'Face Test Employee',
    jshshir: testJshshir(),
    email: `facetest_emp_${suffix}@example.com`,
    passwordHash,
    roleId: roleEmployee._id,
    department: 'QA',
    isActive: true,
  })
  otherEmployee = await User.create({
    fullName: 'Face Test Other Employee',
    jshshir: testJshshir(),
    email: `facetest_other_${suffix}@example.com`,
    passwordHash,
    roleId: roleEmployee._id,
    isActive: true,
  })
  cleanupUserIds.push(superAdmin._id, employee._id, otherEmployee._id)

  tokenSuperAdmin = await login(superAdmin.jshshir, TEST_PASSWORD)
  tokenEmployee = await login(employee.jshshir, TEST_PASSWORD)
  tokenOther = await login(otherEmployee.jshshir, TEST_PASSWORD)
})

after(async () => {
  await FaceProfile.deleteMany({ userId: { $in: cleanupUserIds } })
  await User.deleteMany({ _id: { $in: cleanupUserIds } })
  await disconnectDatabase()
})

// ---------------------------------------------------------------------
// Pure logic — no live server or image needed
// ---------------------------------------------------------------------
describe('Timezone day boundary', () => {
  test('same instant is the same local day', () => {
    const now = new Date()
    assert.ok(isSameLocalDay(now, now, 'Asia/Tashkent'))
  })

  test('yesterday is not the same local day as now', () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    assert.ok(!isSameLocalDay(now, yesterday, 'Asia/Tashkent'))
  })

  test('never-verified (null) is never "verified today"', () => {
    assert.ok(!isSameLocalDay(null, new Date(), 'Asia/Tashkent'))
  })

  test('a UTC instant near midnight can land on a different local day in Tashkent (UTC+5)', () => {
    const justBeforeUtcMidnight = new Date('2026-08-24T23:30:00.000Z')
    const justAfterUtcMidnight = new Date('2026-08-25T00:30:00.000Z')
    // Both are already 2026-08-25 in Asia/Tashkent (UTC+5) — same local day
    // despite crossing a UTC day boundary, which is exactly the case a
    // fixed-offset subtraction would get wrong on a DST-observing zone.
    assert.equal(localDateKey(justBeforeUtcMidnight, 'Asia/Tashkent'), '2026-08-25')
    assert.equal(localDateKey(justAfterUtcMidnight, 'Asia/Tashkent'), '2026-08-25')
  })
})

describe('Face descriptor matching', () => {
  test('identical descriptors score a perfect match', () => {
    const vector = [0.1, 0.9, -0.3, 0.4]
    assert.equal(faceEmbeddingService.similarity(vector, vector), 1)
  })

  test('opposite descriptors score below any sane threshold', () => {
    const a = [1, 0, 0]
    const b = [-1, 0, 0]
    assert.ok(faceEmbeddingService.similarity(a, b) < env.FACE_MATCH_THRESHOLD)
  })

  test('mismatched vector lengths are rejected rather than silently compared', () => {
    assert.throws(() => faceEmbeddingService.similarity([1, 2], [1, 2, 3]))
  })

  test('averaging descriptors returns the per-dimension mean', () => {
    const avg = faceEmbeddingService.averageDescriptors([
      [0, 0, 4],
      [2, 4, 8],
    ])
    assert.deepEqual(avg, [1, 2, 6])
  })
})

// ---------------------------------------------------------------------
// Enrollment — RBAC + validation (no real face needed for these)
// ---------------------------------------------------------------------
describe('Face enrollment', () => {
  test('EMPLOYEE cannot enroll anyone (SUPERADMIN-only, spec §16)', async () => {
    const { status } = await apiForm(
      '/auth/face/enroll',
      multipartWithFile('photos', { userId: otherEmployee._id.toString() }),
      { headers: { Authorization: `Bearer ${tokenEmployee}` } }
    )
    assert.equal(status, 403)
  })

  test('SUPERADMIN gets a clear error when no photo is attached', async () => {
    const form = new FormData()
    form.append('userId', otherEmployee._id.toString())
    const { status, body } = await apiForm('/auth/face/enroll', form, {
      headers: { Authorization: `Bearer ${tokenSuperAdmin}` },
    })
    assert.equal(status, 400)
    assert.equal(body.code, 'FILE_REQUIRED')
  })

  test('SUPERADMIN enrolling an unknown user gets 404', async () => {
    const { status } = await apiForm(
      '/auth/face/enroll',
      multipartWithFile('photos', { userId: '000000000000000000000000' }),
      { headers: { Authorization: `Bearer ${tokenSuperAdmin}` } }
    )
    assert.equal(status, 404)
  })

  test('a photo with no detectable face is rejected, not silently accepted', async () => {
    const { status, body } = await apiForm(
      '/auth/face/enroll',
      multipartWithFile('photos', { userId: otherEmployee._id.toString() }),
      { headers: { Authorization: `Bearer ${tokenSuperAdmin}` } }
    )
    assert.equal(status, 400)
    assert.equal(body.code, 'ENROLLMENT_FRAME_REJECTED')
  })

  test('re-enroll on a user with no prior enrollment is rejected', async () => {
    const { status, body } = await apiForm(
      '/auth/face/re-enroll',
      multipartWithFile('photos', { userId: otherEmployee._id.toString() }),
      { headers: { Authorization: `Bearer ${tokenSuperAdmin}` } }
    )
    assert.equal(status, 404)
    assert.equal(body.code, 'FACE_PROFILE_NOT_ENROLLED')
  })
})

// ---------------------------------------------------------------------
// Status — self-access, structural leak check, RBAC
// ---------------------------------------------------------------------
describe('Face status', () => {
  test('an unenrolled user gets a clean default status, not a 404', async () => {
    const { status, body } = await api('/auth/face/status', {
      headers: { Authorization: `Bearer ${tokenEmployee}` },
    })
    assert.equal(status, 200)
    assert.deepEqual(body.data, { enabled: false, enrolled: false, enrolledAt: null, lastVerifiedAt: null })
  })

  test('the embedding never appears in the status response', async () => {
    // Seed a profile with a real embedding directly at the repository layer
    // (bypassing the detection step, which needs a real face photo) so this
    // test actually has an embedding to prove is absent from the response.
    await faceProfileRepository.upsertEnrollment(employee._id, {
      embedding: [0.1, 0.2, 0.3],
      modelVersion: 'test-fixture',
      referenceImageKey: `${employee._id}/fixture.jpg`,
      referenceImageContentType: 'image/jpeg',
      enrolledBy: superAdmin._id,
    })

    const { status, body } = await api('/auth/face/status', {
      headers: { Authorization: `Bearer ${tokenEmployee}` },
    })
    assert.equal(status, 200)
    assert.equal(body.data.enrolled, true)
    assert.ok(!('embedding' in body.data))
    assert.ok(!JSON.stringify(body).includes('0.1,0.2,0.3'))
  })

  test('EMPLOYEE cannot read another user\'s status', async () => {
    const { status } = await api(`/auth/face/status/${employee._id}`, {
      headers: { Authorization: `Bearer ${tokenOther}` },
    })
    assert.equal(status, 403)
  })

  test('SUPERADMIN can read another user\'s status', async () => {
    const { status, body } = await api(`/auth/face/status/${employee._id}`, {
      headers: { Authorization: `Bearer ${tokenSuperAdmin}` },
    })
    assert.equal(status, 200)
    assert.equal(body.data.enrolled, true)
  })
})

// ---------------------------------------------------------------------
// Verify — RBAC-adjacent auth resolution, lockout
// ---------------------------------------------------------------------
describe('Face verification', () => {
  test('verify with neither a bearer token nor a verification token is rejected', async () => {
    const { status, body } = await apiForm('/auth/face/verify', multipartWithFile('photo'))
    assert.equal(status, 401)
    assert.equal(body.code, 'MISSING_CREDENTIALS')
  })

  test('verify with a garbage verification token is rejected', async () => {
    const { status, body } = await apiForm(
      '/auth/face/verify',
      multipartWithFile('photo', { verificationToken: 'not-a-real-token' })
    )
    assert.equal(status, 401)
    assert.equal(body.code, 'INVALID_VERIFICATION_TOKEN')
  })

  test('verify against a never-enrolled account is refused up front', async () => {
    const { status, body } = await apiForm('/auth/face/verify', multipartWithFile('photo'), {
      headers: { Authorization: `Bearer ${tokenOther}` },
    })
    assert.equal(status, 403)
    assert.equal(body.code, 'FACE_NOT_ENROLLED')
  })

  test('repeated failed attempts lock the account (spec §14)', async () => {
    // `employee` was enrolled with a fixture embedding in the status test
    // above. A blank PNG never contains a face, so every attempt here fails
    // with FACE_NOT_DETECTED — enough to exercise the lockout counter
    // without needing a real photo of anyone.
    let lastStatus, lastBody
    for (let i = 0; i < env.FACE_VERIFICATION_MAX_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await apiForm('/auth/face/verify', multipartWithFile('photo'), {
        headers: { Authorization: `Bearer ${tokenEmployee}` },
      })
      lastStatus = result.status
      lastBody = result.body
    }
    assert.equal(lastStatus, 401)
    assert.equal(lastBody.code, 'FACE_VERIFICATION_FAILED')

    const { status, body } = await apiForm('/auth/face/verify', multipartWithFile('photo'), {
      headers: { Authorization: `Bearer ${tokenEmployee}` },
    })
    assert.equal(status, 429)
    assert.equal(body.code, 'FACE_VERIFICATION_LOCKED')
  })
})

// ---------------------------------------------------------------------
// Login / video-playback gate — only meaningful against a backend booted
// with FACE_VERIFICATION_ENABLED=true FACE_VERIFICATION_REQUIRED=true.
// ---------------------------------------------------------------------
describe('Daily login gate', { skip: !GATE_ENABLED && 'set TEST_FACE_GATE_ENABLED=true against a backend booted with FACE_VERIFICATION_ENABLED/REQUIRED=true to run this' }, () => {
  test('an unenrolled user still logs in normally (ENFORCE_UNENROLLED defaults off)', async () => {
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: otherEmployee.jshshir, password: TEST_PASSWORD }),
    })
    assert.equal(status, 200)
    assert.ok(body.data.accessToken)
    assert.ok(!body.data.requiresFaceVerification)
  })

  test('an enrolled user not yet verified today gets a challenge instead of a session', async () => {
    await FaceProfile.updateOne({ userId: employee._id }, { $set: { lastVerifiedAt: null, lockedUntil: null, failedAttempts: 0 } })
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: employee.jshshir, password: TEST_PASSWORD }),
    })
    assert.equal(status, 200)
    assert.equal(body.data.requiresFaceVerification, true)
    assert.ok(body.data.verificationToken)
    assert.ok(!body.data.accessToken)
  })

  test('an enrolled user already verified today logs in normally', async () => {
    await FaceProfile.updateOne({ userId: employee._id }, { $set: { lastVerifiedAt: new Date(), lockedUntil: null, failedAttempts: 0 } })
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: employee.jshshir, password: TEST_PASSWORD }),
    })
    assert.equal(status, 200)
    assert.ok(body.data.accessToken)
    assert.ok(!body.data.requiresFaceVerification)
  })
})
