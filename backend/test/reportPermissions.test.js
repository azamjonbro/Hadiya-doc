// 8.2 — report:view is a permission that does something.
//
//   GIVEN a role holding report:view and NOT report:export
//   WHEN  it opens a report on screen
//   THEN  it sees the report — and still cannot download a copy of it
//
// It guarded nothing before this. The whole /reports router required
// report:export, so the three seeded roles granted view without export
// (AUTHOR, INSTRUCTOR, MENTOR) were locked out of every report route while
// holding a permission that says otherwise — roles-as-data only works if
// granting a permission changes what someone can do.
//
// The split is the point: reading a report on screen and taking a copy of it
// away are different acts, and the second is the one that leaves the system
// with employee data in it.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { ROLE_SCOPES, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLES } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { env } from '../src/config/env.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const stamp = String(Date.now()).slice(-11)

let viewerRole
let exporterRole
let viewer
let exporter
const createdUsers = []
const createdRoles = []

async function makeRole(name, permissions) {
  const role = await Role.create({ name: `${name}_${stamp}`, permissions, scope: ROLE_SCOPES.ALL })
  createdRoles.push(role._id)
  return role
}

async function makeUser(name, role) {
  const user = await User.create({
    firstName: name,
    lastName: 'Report',
    fullName: `${name} Report`,
    jshshir: `55${createdUsers.length}${stamp}`,
    passwordHash: await hashPassword('ReportPerm123!'),
    roleId: role._id,
  })
  createdUsers.push(user._id)
  return user
}

function tokenFor(user, role) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      roleId: role._id.toString(),
      roleName: role.name,
      permissions: role.permissions,
      scope: ROLE_SCOPES.ALL,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  )
}

async function api(path, token, { method = 'GET' } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  // An export answers with a file, so only JSON responses are parsed.
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
  return { status: res.status, body: isJson ? await res.json().catch(() => null) : null }
}

describe('report:view and report:export are different permissions (8.2)', () => {
  before(async () => {
    await connectDatabase()
    viewerRole = await makeRole('REPORT_VIEWER', [PERMISSIONS.REPORT_VIEW])
    exporterRole = await makeRole('REPORT_EXPORTER', [PERMISSIONS.REPORT_EXPORT])
    viewer = await makeUser('Viewer', viewerRole)
    exporter = await makeUser('Exporter', exporterRole)
  })

  after(async () => {
    await AuditLog.deleteMany({ actor: { $in: createdUsers } })
    await User.deleteMany({ _id: { $in: createdUsers } })
    await Role.deleteMany({ _id: { $in: createdRoles } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  test('the seeded roles that need this actually hold view without export', () => {
    // If this ever stops being true the split below is untested in practice,
    // whatever the routes say.
    for (const role of [ROLES.AUTHOR, ROLES.INSTRUCTOR, ROLES.MENTOR]) {
      const held = DEFAULT_ROLE_PERMISSIONS[role] ?? []
      assert.ok(held.includes(PERMISSIONS.REPORT_VIEW), `${role} lost report:view`)
      assert.ok(!held.includes(PERMISSIONS.REPORT_EXPORT), `${role} gained report:export`)
    }
  })

  test('a viewer can list the report types', async () => {
    const { status, body } = await api('/reports', tokenFor(viewer, viewerRole))
    assert.equal(status, 200)
    assert.ok(body.data.types.length > 0)
  })

  test('a viewer can read a report on screen', async () => {
    const { status, body } = await api('/reports/employee-progress/preview', tokenFor(viewer, viewerRole))
    assert.equal(status, 200)
    assert.ok(Array.isArray(body.data.rows))
    assert.ok(body.data.columns.length > 0)
    assert.equal(typeof body.data.totalRows, 'number')
    // The preview says what it did not show, exactly as the file does.
    assert.equal(typeof body.data.previewRows, 'number')
    assert.equal(body.data.truncated, body.data.totalRows > body.data.previewRows)
  })

  test('a viewer cannot download a copy', async () => {
    const { status } = await api('/reports/employee-progress/export?format=csv', tokenFor(viewer, viewerRole))
    assert.equal(status, 403)
  })

  test('a viewer cannot queue one either', async () => {
    const { status } = await api('/reports/employee-progress/export-job?format=csv', tokenFor(viewer, viewerRole), {
      method: 'POST',
    })
    assert.equal(status, 403)
  })

  test('an exporter can still do both — being allowed to take it implies being allowed to look', async () => {
    const token = tokenFor(exporter, exporterRole)
    assert.equal((await api('/reports', token)).status, 200)
    assert.equal((await api('/reports/employee-progress/preview', token)).status, 200)
    assert.equal((await api('/reports/employee-progress/export?format=csv', token)).status, 200)
  })

  test('reading a report on screen is audited, like taking a copy of it', async () => {
    await api('/reports/employee-progress/preview', tokenFor(viewer, viewerRole))
    const entry = await AuditLog.findOne({ actor: viewer._id, action: 'REPORT_VIEWED' }).sort({ timestamp: -1 }).lean()
    assert.ok(entry, 'a report read left no trace')
    assert.equal(entry.entityId, 'employee-progress')
    assert.equal(typeof entry.metadata.rowCount, 'number')
  })

  test('no token, no report', async () => {
    const res = await fetch(`${BASE_URL}/reports/employee-progress/preview`)
    assert.equal(res.status, 401)
  })
})
