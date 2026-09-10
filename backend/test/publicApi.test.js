// 11.1 — API keys and the public API.
//
// The tests are about the boundary, because that is what this item *is*:
//
//   - a key's secret is never stored, so a leaked database hands over
//     nothing that works;
//   - a bad key gets one answer whatever is wrong with it — revoked,
//     expired and never-existed are indistinguishable, which is exactly
//     what somebody enumerating prefixes must not learn;
//   - the two doors do not connect: a session token is refused on the
//     public API and a key is refused on the private one;
//   - authorisation is the *same* `requirePermission` the private routes
//     use, reading the key's scopes — so there is one implementation of
//     "may this caller do that" rather than two that drift;
//   - identifiers (JSHSHIR) are masked unless the key was explicitly
//     granted them, which is a separate decision from "may read users".

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { ApiKey } from '../src/models/apiKey.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { apiKeyService, splitKey, GRANTABLE_SCOPES } from '../src/services/integrations/apiKey.service.js'
import { publicApiService } from '../src/services/integrations/publicApi.service.js'
import { apiKeyAuth } from '../src/middlewares/apiKeyAuth.middleware.js'
import { publicUsersSchema } from '../src/validators/publicApi.validator.js'
import { PERMISSIONS } from '@lms/shared'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let admin
const userIds = []
const courseIds = []
const keyIds = []

const actor = () => ({ id: admin._id.toString(), roleName: 'SUPERADMIN', permissions: [] })

/** Runs the middleware against a fake request, the way express would. */
async function runAuth(headers) {
  const req = { headers, ip: '127.0.0.1' }
  let error = null
  await apiKeyAuth(req, {}, (err) => {
    error = err ?? null
  })
  return { req, error }
}

async function makeKey(overrides = {}) {
  const created = await apiKeyService.create(actor(), {
    name: `Probe ${stamp}`,
    scopes: [PERMISSIONS.USER_READ, PERMISSIONS.COURSE_READ],
    ...overrides,
  })
  keyIds.push(new mongoose.Types.ObjectId(created.id))
  return created
}

describe('11.1 · API keys and the public API', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')
    admin = await User.create({
      firstName: 'Kalit',
      lastName: 'Admin',
      fullName: 'Kalit Admin',
      jshshir: `22${stamp}001`,
      passwordHash: await hashPassword('KeyTest123!'),
      roleId: role._id,
      branch: `probe-branch-${stamp}`,
      department: 'IT',
    })
    userIds.push(admin._id)
  })

  after(async () => {
    await AuditLog.deleteMany({ entity: 'ApiKey', entityId: { $in: keyIds.map(String) } })
    await ApiKey.deleteMany({ _id: { $in: keyIds } })
    await CourseAssignment.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('the key itself', () => {
    test('the secret is shown once and never stored', async () => {
      const created = await makeKey()
      assert.match(created.key, /^lms_[a-f\d]{8}_[A-Za-z0-9_-]{20,}$/)

      const stored = await ApiKey.findById(created.id).lean()
      // Argon2, like a password: a leaked database must not hand over
      // working credentials.
      assert.match(stored.hash, /^\$argon2/)
      assert.equal(stored.hash.includes(created.key), false)
      // And nothing in the list can show it again, because the platform
      // does not have it.
      const listed = (await apiKeyService.list()).find((row) => row.id === created.id)
      assert.equal(listed.key, undefined)
      assert.equal(listed.prefix, created.prefix)
    })

    test('only read scopes can be granted', async () => {
      // A public API that can enrol people or delete a course is a
      // different product with a different review.
      await assert.rejects(
        () => apiKeyService.create(actor(), { name: 'Too much', scopes: [PERMISSIONS.COURSE_DELETE] }),
        { code: 'SCOPE_NOT_GRANTABLE' }
      )
      await assert.rejects(() => apiKeyService.create(actor(), { name: 'Nothing', scopes: [] }), { code: 'NO_SCOPES' })
      GRANTABLE_SCOPES.forEach((scope) => assert.match(scope, /read|view|export/))
    })

    test('a malformed key is not even looked up', async () => {
      assert.equal(splitKey('nonsense'), null)
      assert.equal(splitKey('lms_short_x'), null)
      assert.equal(await apiKeyService.verify('nonsense'), null)
    })

    test('revoked, expired and unknown all fail the same way', async () => {
      const good = await makeKey()
      assert.ok(await apiKeyService.verify(good.key))

      await apiKeyService.revoke(actor(), good.id)
      assert.equal(await apiKeyService.verify(good.key), null)

      const expired = await makeKey({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      assert.equal(await apiKeyService.verify(expired.key), null)

      // The point: `verify` returns null and nothing else, so the middleware
      // has one message for every case and cannot leak which prefixes exist.
      const { error } = await runAuth({ 'x-api-key': good.key })
      assert.equal(error.code, 'INVALID_API_KEY')
      const unknown = await runAuth({ 'x-api-key': 'lms_deadbeef_aaaaaaaaaaaaaaaaaaaaaaaa' })
      assert.equal(unknown.error.code, 'INVALID_API_KEY')
      assert.equal(unknown.error.message, error.message)
    })

    test('revoking keeps the row rather than deleting it', async () => {
      const created = await makeKey()
      await apiKeyService.revoke(actor(), created.id)
      const stored = await ApiKey.findById(created.id).lean()
      // The audit trail of what a key read outlives the key; a deleted
      // prefix could also be reissued.
      assert.ok(stored)
      assert.ok(stored.revokedAt)
      assert.equal(String(stored.revokedBy), admin._id.toString())
      const audit = await AuditLog.find({ entity: 'ApiKey', entityId: created.id }).lean()
      assert.deepEqual(
        audit.map((row) => row.action).sort(),
        ['API_KEY_CREATED', 'API_KEY_REVOKED']
      )
    })

    test('using a key sets the scopes the shared permission check reads', async () => {
      const created = await makeKey({ scopes: [PERMISSIONS.COURSE_READ] })
      const { req, error } = await runAuth({ authorization: `Bearer ${created.key}` })
      assert.equal(error, null)
      // This is what lets a public route use `requirePermission` — the same
      // middleware the private routes use, not a parallel check.
      assert.deepEqual(req.user.permissions, [PERMISSIONS.COURSE_READ])
      // And nothing can mistake it for a session: role-gated routes refuse
      // `API_KEY` by construction.
      assert.equal(req.user.roleName, 'API_KEY')
      assert.equal(req.apiKey.prefix, created.prefix)
    })

    test('both header styles work', async () => {
      const created = await makeKey()
      assert.equal((await runAuth({ authorization: `Bearer ${created.key}` })).error, null)
      assert.equal((await runAuth({ 'x-api-key': created.key })).error, null)
      assert.equal((await runAuth({})).error.code, 'MISSING_API_KEY')
    })

    test('usage is recorded for the "is this still in use" question', async () => {
      const created = await makeKey()
      await runAuth({ 'x-api-key': created.key })
      // Fire-and-forget, so give it a moment.
      await new Promise((resolve) => setTimeout(resolve, 150))
      const stored = await ApiKey.findById(created.id).lean()
      assert.equal(stored.requestCount, 1)
      assert.ok(stored.lastUsedAt)
    })
  })

  describe('what the public API returns', () => {
    test('identifiers are masked unless the key was granted them', async () => {
      const masked = await publicApiService.users({ limit: 5, department: 'IT', includePii: false })
      const mine = masked.items.find((item) => item.id === admin._id.toString())
      assert.match(mine.jshshir, /^\*+\d{4}$/)
      assert.equal(mine.email, '')

      // A separate decision from "may read users": an HR sync needs the
      // identifier, a dashboard counting completions does not.
      const full = await publicApiService.users({ limit: 5, department: 'IT', includePii: true })
      const same = full.items.find((item) => item.id === admin._id.toString())
      assert.equal(same.jshshir, admin.jshshir)
    })

    test('a payload carries what another system needs and nothing else', async () => {
      const page = await publicApiService.users({ limit: 1, includePii: false })
      const [item] = page.items
      // Small on purpose: an HR system needs a person's id, name and where
      // they work — not their attention-monitoring settings.
      assert.deepEqual(Object.keys(item).sort(), [
        'branch',
        'createdAt',
        'department',
        'email',
        'firstName',
        'fullName',
        'hireDate',
        'id',
        'isActive',
        'jshshir',
        'lastName',
        'position',
      ])
    })

    test('courses default to published, because a draft is somebody’s work in progress', async () => {
      const draft = await Course.create({
        title: `Public draft ${stamp}`,
        slug: `public-draft-${stamp}`,
        status: 'DRAFT',
        createdBy: admin._id,
      })
      const live = await Course.create({
        title: `Public live ${stamp}`,
        slug: `public-live-${stamp}`,
        status: 'PUBLISHED',
        createdBy: admin._id,
      })
      courseIds.push(draft._id, live._id)

      const page = await publicApiService.courses({ limit: 100 })
      const ids = page.items.map((item) => item.id)
      assert.ok(ids.includes(live._id.toString()))
      assert.equal(ids.includes(draft._id.toString()), false)

      // Asked for explicitly, a draft is available — the default is the
      // protection, not a prohibition.
      const drafts = await publicApiService.courses({ limit: 100, status: 'DRAFT' })
      assert.ok(drafts.items.map((item) => item.id).includes(draft._id.toString()))
    })

    test('the completions feed answers "what changed since yesterday"', async () => {
      const course = await Course.create({
        title: `Feed course ${stamp}`,
        slug: `feed-course-${stamp}`,
        status: 'PUBLISHED',
        createdBy: admin._id,
      })
      courseIds.push(course._id)
      await CourseAssignment.create({
        userId: admin._id,
        courseId: course._id,
        assignedBy: admin._id,
        status: 'COMPLETED',
        completedAt: new Date(),
      })

      const recent = await publicApiService.assignments({
        limit: 50,
        completedSince: new Date(Date.now() - 60_000).toISOString(),
      })
      const row = recent.items.find((item) => item.courseId === course._id.toString())
      assert.ok(row, 'a completion from a minute ago is in the feed')
      // Names travel with it: an integration should not have to make a
      // second request per row to label anything.
      assert.equal(row.userName, admin.fullName)
      assert.equal(row.courseTitle, course.title)

      const old = await publicApiService.assignments({
        limit: 50,
        completedSince: new Date(Date.now() + 60_000).toISOString(),
      })
      assert.equal(old.items.length, 0)
    })

    test('paging is bounded, so one request cannot ask for everything', async () => {
      // A page that takes a second to build is a page an integration times
      // out on; the ceiling is the protection and a smaller page is one
      // more cheap request.
      assert.equal((await publicApiService.users({ limit: 5000 })).limit, 200)
      assert.equal((await publicApiService.users({ page: -3 })).page, 1)
      // Absent (or zero, which the schema refuses at the edge) means the
      // default rather than an error deep in the service.
      assert.equal((await publicApiService.users({})).limit, 50)
      assert.equal(publicUsersSchema.safeParse({ limit: '0' }).success, false)
      assert.equal(publicUsersSchema.safeParse({ limit: '201' }).success, false)
      // An unparseable `updatedSince` is refused rather than ignored:
      // silently returning *everything* to a caller who asked for
      // yesterday's changes is how a sync re-imports the whole company.
      assert.equal(publicUsersSchema.safeParse({ updatedSince: 'last tuesday' }).success, false)
      assert.equal(publicUsersSchema.safeParse({ updatedSince: '2026-09-01' }).success, true)
    })
  })
})
