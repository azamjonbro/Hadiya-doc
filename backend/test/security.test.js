// Integration security test suite — spec §50. Runs against a LIVE backend
// (the same dev stack every phase in this project has been verified
// against: node --watch src/server.js, MongoDB, Redis) rather than mocks,
// because the properties under test — real JWT verification, real
// rate-limit middleware, real CORS headers, a real Mongo-backed session
// reuse check — are exactly the kind of thing a mock would quietly stop
// testing. Requires the backend at TEST_BASE_URL (default
// http://localhost:4000/api/v1) and a reachable MONGO_URI (same as the
// server's own .env).
//
// Run with: npm test  (from backend/)
//
// Note: /auth/login is IP-rate-limited (20/15min, spec §35) same as in
// production. Running this suite several times back-to-back from the same
// machine within 15 minutes can trip that real limiter and turn later
// `before()` logins into 429s — that's the rate limiter doing its job, not
// a bug in the suite. Restart the backend (resets its in-memory limiter
// state) or wait out the window if that happens.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { connectDatabase, disconnectDatabase } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { Material } from '../src/models/material.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { Session } from '../src/models/session.model.js'
import { News } from '../src/models/news.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { hashOpaqueToken } from '../src/utils/tokens.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const TEST_PASSWORD = 'SecTest123!'

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    // non-JSON response (file export, empty body) — callers that expect
    // JSON assert on `status`/`headers` instead
  }
  return { status: res.status, headers: res.headers, body }
}

function parseCookies(setCookieHeaders) {
  const jar = {}
  for (const line of setCookieHeaders ?? []) {
    const pair = line.split(';')[0]
    const idx = pair.indexOf('=')
    jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
  }
  return jar
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

async function login(identifier, password) {
  const { status, body } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
  assert.equal(status, 200, `login failed for ${identifier}: ${JSON.stringify(body)}`)
  return body.data.accessToken
}

// ---- shared fixtures ----
let roleEmployee, roleManager
let userA, userB, userManager
let course, topic, video, material
let tokenA, tokenB, tokenManager
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
const cleanupUserIds = []

// Accounts are keyed by JSHSHIR now, and it is unique and exactly 14 digits.
// One counter per run, prefixed with the run's own digits, keeps concurrent
// runs of this suite from colliding on it.
let jshshirCounter = 0
const runDigits = suffix.replace(/\D/g, '').slice(-9)
function testJshshir() {
  jshshirCounter += 1
  return `9${runDigits}${String(jshshirCounter).padStart(4, '0')}`
}

before(async () => {
  await connectDatabase()

  roleEmployee = await Role.findOne({ name: 'EMPLOYEE' })
  roleManager = await Role.findOne({ name: 'MANAGER' })
  assert.ok(roleEmployee && roleManager, 'EMPLOYEE/MANAGER roles must be seeded before running security tests')

  const passwordHash = await hashPassword(TEST_PASSWORD)

  userA = await User.create({
    fullName: 'Security Test A',
    jshshir: testJshshir(),
    email: `sectest_a_${suffix}@example.com`,
    passwordHash,
    roleId: roleEmployee._id,
    department: 'QA',
    isActive: true,
  })
  userB = await User.create({
    fullName: 'Security Test B',
    jshshir: testJshshir(),
    email: `sectest_b_${suffix}@example.com`,
    passwordHash,
    roleId: roleEmployee._id,
    department: 'QA',
    isActive: true,
  })
  userManager = await User.create({
    fullName: 'Security Test Manager',
    jshshir: testJshshir(),
    email: `sectest_mgr_${suffix}@example.com`,
    passwordHash,
    roleId: roleManager._id,
    department: 'QA',
    isActive: true,
  })
  cleanupUserIds.push(userA._id, userB._id, userManager._id)

  course = await Course.create({
    title: `Security Test Course ${suffix}`,
    slug: `security-test-course-${suffix}`,
    status: 'PUBLISHED',
    createdBy: userManager._id,
  })
  topic = await Topic.create({
    courseId: course._id,
    title: 'Security Test Topic',
    slug: `security-test-topic-${suffix}`,
    status: 'PUBLISHED',
    order: 1,
    createdBy: userManager._id,
  })
  video = await Video.create({
    topicId: topic._id,
    courseId: course._id,
    title: 'Security Test Video',
    status: 'PUBLISHED',
    processingStatus: 'READY',
    hlsManifestKey: `videos/${suffix}/master.m3u8`,
    qualities: ['720p'],
    createdBy: userManager._id,
  })

  // Fake key — materialAccessService.getDownloadUrl only *presigns* a URL
  // (a local crypto operation against S3StorageProvider), it never fetches
  // the object, so no real upload is needed to test the authorization gate.
  material = await Material.create({
    topicId: topic._id,
    courseId: course._id,
    type: 'FILE',
    title: 'Security Test Material',
    status: 'PUBLISHED',
    key: `${suffix}/file/fixture.pdf`,
    mimeType: 'application/pdf',
    fileSize: 100,
    createdBy: userManager._id,
  })

  // userA is assigned; userB deliberately is not — used as the "someone
  // else's resource" identity across the IDOR/authorization tests below.
  await CourseAssignment.create({
    userId: userA._id,
    courseId: course._id,
    mandatory: true,
    assignedBy: userManager._id,
    status: 'ACTIVE',
  })

  tokenA = await login(userA.jshshir, TEST_PASSWORD)
  tokenB = await login(userB.jshshir, TEST_PASSWORD)
  tokenManager = await login(userManager.jshshir, TEST_PASSWORD)
})

after(async () => {
  await CourseAssignment.deleteMany({ courseId: course._id })
  await Material.deleteOne({ _id: material._id })
  await Video.deleteOne({ _id: video._id })
  await Topic.deleteOne({ _id: topic._id })
  await Course.deleteOne({ _id: course._id })
  await Session.deleteMany({ userId: { $in: cleanupUserIds } })
  await User.deleteMany({ _id: { $in: cleanupUserIds } })
  await disconnectDatabase()
})

// ---------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------
describe('Authentication', () => {
  test('wrong password is rejected', async () => {
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: userA.jshshir, password: 'wrong-password' }),
    })
    assert.equal(status, 401)
    assert.equal(body.code, 'INVALID_CREDENTIALS')
  })

  test('nonexistent identifier returns the same generic error (no user enumeration)', async () => {
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `no-such-user-${suffix}`, password: 'whatever123' }),
    })
    assert.equal(status, 401)
    assert.equal(body.code, 'INVALID_CREDENTIALS')
  })

  test('account locks after repeated failed attempts (spec §50 + §35)', async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD)
    const victim = await User.create({
      fullName: 'Lockout Victim',
      jshshir: testJshshir(),
      email: `sectest_lock_${suffix}@example.com`,
      passwordHash,
      roleId: roleEmployee._id,
      isActive: true,
    })
    try {
      for (let i = 0; i < env.LOGIN_MAX_ATTEMPTS; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier: victim.jshshir, password: 'wrong' }),
        })
      }
      const { status, body } = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: victim.jshshir, password: TEST_PASSWORD }),
      })
      assert.equal(status, 429)
      assert.equal(body.code, 'ACCOUNT_LOCKED')
    } finally {
      await User.deleteOne({ _id: victim._id })
    }
  })

  test('missing Authorization header is rejected', async () => {
    const { status, body } = await api('/users/me')
    assert.equal(status, 401)
    assert.equal(body.code, 'MISSING_ACCESS_TOKEN')
  })

  test('malformed JWT is rejected', async () => {
    const { status } = await api('/users/me', { headers: { Authorization: 'Bearer not-a-real-jwt' } })
    assert.equal(status, 401)
  })

  test('JWT signed with the wrong secret is rejected (signature not just decoded)', async () => {
    const forged = jwt.sign(
      { sub: userA._id.toString(), roleId: roleEmployee._id.toString(), roleName: 'SUPERADMIN', permissions: ['role:manage'] },
      'a-completely-wrong-secret'
    )
    const { status } = await api('/users/me', { headers: { Authorization: `Bearer ${forged}` } })
    assert.equal(status, 401)
  })

  test('expired JWT is rejected even with a valid signature', async () => {
    const expired = jwt.sign(
      { sub: userA._id.toString(), roleId: roleEmployee._id.toString(), roleName: 'EMPLOYEE', permissions: [] },
      env.JWT_ACCESS_SECRET,
      { expiresIn: -10 }
    )
    const { status, body } = await api('/users/me', { headers: { Authorization: `Bearer ${expired}` } })
    assert.equal(status, 401)
    assert.equal(body.code, 'INVALID_ACCESS_TOKEN')
  })
})

// ---------------------------------------------------------------------
// Authorization & privilege escalation
// ---------------------------------------------------------------------
describe('Authorization & privilege escalation', () => {
  test('employee cannot create a course (missing course:create)', async () => {
    const { status } = await api('/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ title: 'Should not be created' }),
    })
    assert.equal(status, 403)
  })

  test('employee cannot view the admin analytics dashboard', async () => {
    const { status } = await api('/dashboard', { headers: { Authorization: `Bearer ${tokenA}` } })
    assert.equal(status, 403)
  })

  test('employee cannot export reports', async () => {
    const { status } = await api('/reports/employee-progress/export?format=csv', {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    assert.equal(status, 403)
  })

  test('manager cannot update a user (user:update is ADMIN-tier, not MANAGER)', async () => {
    const { status } = await api(`/users/${userA._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenManager}` },
      body: JSON.stringify({ department: 'Should not apply' }),
    })
    assert.equal(status, 403)
  })

  test('employee cannot escalate their own role via the user-update endpoint', async () => {
    const { status } = await api(`/users/${userA._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ roleName: 'SUPERADMIN' }),
    })
    assert.equal(status, 403)
    const fresh = await User.findById(userA._id)
    assert.equal(fresh.roleId.toString(), roleEmployee._id.toString())
  })

  test('employee cannot create an upload session (missing video:upload)', async () => {
    const res = await fetch(`${BASE_URL}/videos/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': '1000',
      },
    })
    assert.equal(res.status, 403)
  })
})

// ---------------------------------------------------------------------
// IDOR protection (spec §51 worked example: GET /users/:id/courses)
// ---------------------------------------------------------------------
describe('IDOR protection', () => {
  test('a user can read their own course list', async () => {
    const { status } = await api(`/users/${userA._id}/courses`, { headers: { Authorization: `Bearer ${tokenA}` } })
    assert.equal(status, 200)
  })

  test('a user cannot read another user\'s course list by substituting the URL id', async () => {
    const { status, body } = await api(`/users/${userA._id}/courses`, { headers: { Authorization: `Bearer ${tokenB}` } })
    assert.equal(status, 403)
    assert.notEqual(body.code, undefined)
  })

  test('a holder of user:read CAN read any user\'s course list (the escape hatch is permission-gated, not open)', async () => {
    const { status } = await api(`/users/${userA._id}/courses`, { headers: { Authorization: `Bearer ${tokenManager}` } })
    assert.equal(status, 200)
  })
})

// ---------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------
describe('CORS', () => {
  test('a disallowed origin is not reflected in Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${BASE_URL}/health`, { headers: { Origin: 'https://evil.example.com' } })
    const acao = res.headers.get('access-control-allow-origin')
    assert.notEqual(acao, 'https://evil.example.com')
    assert.notEqual(acao, '*')
  })

  test('an allowed origin gets a proper (non-wildcard) CORS header', async () => {
    const res = await fetch(`${BASE_URL}/health`, { headers: { Origin: 'http://localhost:5173' } })
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  })
})

// ---------------------------------------------------------------------
// File upload abuse
// ---------------------------------------------------------------------
describe('Upload abuse protection', () => {
  function tusMetadata(fields) {
    return Object.entries(fields)
      .map(([k, v]) => `${k} ${Buffer.from(String(v)).toString('base64')}`)
      .join(',')
  }

  test('an upload declaring a disallowed file extension is rejected at creation, before any bytes are stored', async () => {
    const res = await fetch(`${BASE_URL}/videos/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenManager}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': '1000',
        'Upload-Metadata': tusMetadata({ topicId: topic._id.toString(), title: 'evil', filename: 'malware.exe' }),
      },
    })
    assert.equal(res.status, 400)
  })

  test('an upload for a nonexistent topic is rejected', async () => {
    const res = await fetch(`${BASE_URL}/videos/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenManager}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': '1000',
        'Upload-Metadata': tusMetadata({ topicId: '000000000000000000000000', title: 'x', filename: 'x.mp4' }),
      },
    })
    assert.equal(res.status, 404)
  })

  test('a material upload whose bytes don\'t match its claimed type is rejected by magic-byte detection, not the client-declared filename', async () => {
    const form = new FormData()
    form.append('type', 'FILE')
    form.append('title', 'evil')
    // Filename claims .pdf but the bytes are plain text — file-type must
    // catch this rather than trusting the extension.
    form.append('file', new Blob([Buffer.from('not actually a pdf')], { type: 'application/pdf' }), 'evil.pdf')
    const res = await fetch(`${BASE_URL}/topics/${topic._id}/materials`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenManager}` },
      body: form,
    })
    assert.equal(res.status, 400)
  })
})

// ---------------------------------------------------------------------
// Rate limiting — confirms the middleware is actually mounted and live,
// not just present in source. Full 429-triggering is exercised by the
// account-lockout test above at a realistic threshold (5 attempts);
// hammering a limiter to its 20-request window here would be slow and
// mostly redundant with that.
// ---------------------------------------------------------------------
describe('Rate limiting', () => {
  test('the login route reports live rate-limit headers', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: userA.jshshir, password: 'wrong' }),
    })
    assert.ok(res.headers.get('ratelimit-limit'), 'expected a RateLimit-Limit header on the login route')
  })

  test('the AI chat route reports its own (tighter) rate-limit headers', async () => {
    const res = await fetch(`${BASE_URL}/ai-chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ courseId: course._id.toString(), message: 'hi' }),
    })
    assert.ok(res.headers.get('ratelimit-limit'), 'expected a RateLimit-Limit header on the AI chat route')
  })
})

// ---------------------------------------------------------------------
// Session / refresh token handling — rotation, reuse detection, CSRF
// ---------------------------------------------------------------------
describe('Session security', () => {
  test('refresh without a CSRF header is rejected', async () => {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: userA.jshshir, password: TEST_PASSWORD }),
    })
    const jar = parseCookies(loginRes.headers.getSetCookie())
    const res = await fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', headers: { Cookie: cookieHeader(jar) } })
    assert.equal(res.status, 403)
  })

  test('refresh with a CSRF header that doesn\'t match the cookie is rejected', async () => {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: userA.jshshir, password: TEST_PASSWORD }),
    })
    const jar = parseCookies(loginRes.headers.getSetCookie())
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar), 'x-csrf-token': 'totally-wrong-value' },
    })
    assert.equal(res.status, 403)
  })

  test('reusing a rotated-out refresh token: forgiven inside the grace window, theft outside it', async () => {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: userB.jshshir, password: TEST_PASSWORD }),
    })
    const originalJar = parseCookies(loginRes.headers.getSetCookie())
    const originalCookieHeader = cookieHeader(originalJar)
    const csrfToken = originalJar.csrf_token

    // First refresh: legitimate, rotates the token.
    const refresh1 = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: originalCookieHeader, 'x-csrf-token': csrfToken },
    })
    assert.equal(refresh1.status, 200)

    // The same token again, straight away — two tabs reloading. Under the
    // default `grace` mode (and `off`) this is served from the live end of
    // the chain rather than treated as theft.
    const reuse = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: originalCookieHeader, 'x-csrf-token': csrfToken },
    })
    const mode = env.REFRESH_REUSE_DETECTION
    if (mode === 'strict') {
      assert.equal(reuse.status, 401)
      assert.equal((await reuse.json()).code, 'REFRESH_REUSE_DETECTED')
      return
    }
    assert.equal(reuse.status, 200, 'a reload race is not theft')
    const latestJar = parseCookies(reuse.headers.getSetCookie())

    if (mode === 'grace') {
      // Backdate the rotation past the window: now it is theft, and the
      // whole family goes — the live token included.
      await Session.collection.updateOne(
        { refreshTokenHash: hashOpaqueToken(originalJar.refresh_token) },
        { $set: { updatedAt: new Date(Date.now() - 5 * 60 * 1000) } }
      )
      const late = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: originalCookieHeader, 'x-csrf-token': csrfToken },
      })
      assert.equal(late.status, 401)
      assert.equal((await late.json()).code, 'REFRESH_REUSE_DETECTED')
      const afterFamilyRevoke = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: cookieHeader(latestJar), 'x-csrf-token': latestJar.csrf_token },
      })
      assert.equal(afterFamilyRevoke.status, 401)
    }
  })
})

// ---------------------------------------------------------------------
// Expired / overdue course access
// ---------------------------------------------------------------------
describe('Expired course access', () => {
  test('an assignment past its expiresAt cannot mint a video playback token, regardless of client state', async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD)
    const expiredUser = await User.create({
      fullName: 'Expired Access User',
      jshshir: testJshshir(),
      email: `sectest_exp_${suffix}@example.com`,
      passwordHash,
      roleId: roleEmployee._id,
      isActive: true,
    })
    try {
      await CourseAssignment.create({
        userId: expiredUser._id,
        courseId: course._id,
        mandatory: true,
        assignedBy: userManager._id,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 60_000),
      })
      const expiredToken = await login(expiredUser.jshshir, TEST_PASSWORD)
      const { status, body } = await api(`/video-access/${video._id}/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${expiredToken}` },
      })
      assert.equal(status, 403)
      assert.equal(body.code, 'COURSE_ACCESS_DENIED')
    } finally {
      await CourseAssignment.deleteMany({ userId: expiredUser._id })
      await Session.deleteMany({ userId: expiredUser._id })
      await User.deleteOne({ _id: expiredUser._id })
    }
  })
})

// ---------------------------------------------------------------------
// Video authorization + signed URL / playback token expiration
// ---------------------------------------------------------------------
describe('Video authorization and playback tokens', () => {
  test('a user with no assignment to the course cannot get a playback token', async () => {
    const { status, body } = await api(`/video-access/${video._id}/token`, { headers: { Authorization: `Bearer ${tokenB}` }, method: 'POST' })
    assert.equal(status, 403)
    assert.equal(body.code, 'COURSE_ACCESS_DENIED')
  })

  test('an assigned user CAN get a playback token', async () => {
    const { status, body } = await api(`/video-access/${video._id}/token`, { headers: { Authorization: `Bearer ${tokenA}` }, method: 'POST' })
    assert.equal(status, 200)
    assert.ok(body.data.token)
  })

  test('an expired playback token is rejected by the stream endpoint', async () => {
    const expired = jwt.sign({ sub: userA._id.toString(), videoId: video._id.toString() }, env.VIDEO_TOKEN_SECRET, { expiresIn: -10 })
    const res = await fetch(`${BASE_URL}/video-stream/${video._id}/master.m3u8?token=${expired}`)
    assert.equal(res.status, 401)
  })

  test('a playback token scoped to a different videoId is rejected', async () => {
    const wrongScope = jwt.sign(
      { sub: userA._id.toString(), videoId: '000000000000000000000000' },
      env.VIDEO_TOKEN_SECRET,
      { expiresIn: 60 }
    )
    const res = await fetch(`${BASE_URL}/video-stream/${video._id}/master.m3u8?token=${wrongScope}`)
    assert.equal(res.status, 401)
  })

  test('a missing token on a stream request is rejected', async () => {
    const res = await fetch(`${BASE_URL}/video-stream/${video._id}/master.m3u8`)
    assert.equal(res.status, 401)
  })
})

// ---------------------------------------------------------------------
// Material authorization — mirrors the "Video authorization" block above:
// a signed download URL must be gated by the same course-assignment check,
// not just "any authenticated VIDEO_VIEW holder" (see
// materialAccess.service.js).
// ---------------------------------------------------------------------
describe('Material authorization', () => {
  test('a user with no assignment to the course cannot get a material download URL', async () => {
    const { status, body } = await api(`/materials/${material._id}/download-url`, { headers: { Authorization: `Bearer ${tokenB}` } })
    assert.equal(status, 403)
    assert.equal(body.code, 'COURSE_ACCESS_DENIED')
  })

  test('an assigned user CAN get a material download URL', async () => {
    const { status, body } = await api(`/materials/${material._id}/download-url`, { headers: { Authorization: `Bearer ${tokenA}` } })
    assert.equal(status, 200)
    assert.ok(body.data.url)
  })
})

// ---------------------------------------------------------------------
// Path traversal (backend/src/services/videos/videoStream.service.js —
// fixed as part of this hardening pass, see docs/security-threat-model.md)
// ---------------------------------------------------------------------
describe('Path traversal', () => {
  test('a segment filename containing an encoded ../ sequence is rejected, not resolved into the storage key', async () => {
    const { body } = await api(`/video-access/${video._id}/token`, { headers: { Authorization: `Bearer ${tokenA}` }, method: 'POST' })
    const token = body.data.token
    const traversal = encodeURIComponent('../../../master.m3u8')
    const res = await fetch(`${BASE_URL}/video-stream/${video._id}/720p/${traversal}?token=${token}`)
    assert.equal(res.status, 400)
  })

  test('a legitimate-looking filename for a real quality still 404s cleanly when the object doesn\'t exist (no path confusion)', async () => {
    const { body } = await api(`/video-access/${video._id}/token`, { headers: { Authorization: `Bearer ${tokenA}` }, method: 'POST' })
    const token = body.data.token
    const res = await fetch(`${BASE_URL}/video-stream/${video._id}/720p/index.m3u8?token=${token}`)
    // No object was ever actually uploaded/transcoded for this fixture video,
    // so this must 404 (missing object) or 500 from the storage layer — the
    // one thing it must NOT do is succeed with someone else's content.
    assert.notEqual(res.status, 200)
  })
})

// ---------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------
describe('Injection', () => {
  test('a NoSQL operator payload in the login body is rejected by schema validation before it can reach a query', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: { $gt: '' }, password: { $gt: '' } }),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'VALIDATION_ERROR')
  })

  test('an operator payload in a query-string filter is likewise rejected', async () => {
    const res = await fetch(`${BASE_URL}/users?department[$ne]=`, { headers: { Authorization: `Bearer ${tokenManager}` } })
    // Either the query validator rejects the shape, or it's silently
    // coerced to a harmless string by Zod — never evaluated as a Mongo
    // operator. A 500 here would mean an unhandled operator reached the DB.
    assert.notEqual(res.status, 500)
  })
})

// ---------------------------------------------------------------------
// XSS
// ---------------------------------------------------------------------
describe('XSS', () => {
  test('news content containing a script tag is stored and returned as inert plain text', async () => {
    const payload = '<script>alert(document.cookie)</script>'
    const { status, body } = await api('/news', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenManager}` },
      body: JSON.stringify({ title: `XSS test ${suffix}`, content: payload, status: 'DRAFT' }),
    })
    assert.equal(status, 201)
    // Stored verbatim as a string — safety is that it's never interpreted
    // as HTML (Vue's default template escaping on render), not that the
    // server strips or mutates it.
    assert.equal(body.data.content, payload)
    await News.deleteOne({ _id: body.data.id })
  })
})
