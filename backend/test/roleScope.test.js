// AT-21 — a custom role is scoped too.
//
//   GIVEN a role created through the API with user:read and scope DEPARTMENT
//   WHEN  someone holding it calls GET /users
//   THEN  only their own department comes back
//
// Before 2.2 the fence was `roleName === 'MANAGER'`, so this returned the
// entire company: roles were data everywhere except in the one place that
// decided how far they could see. That is why the checklist marks it red.
//
// The other half of the change is that it must not have moved the fence for
// anyone who already had one, so MANAGER is asserted to behave exactly as
// before, and an old token — issued without a `scope` claim — is asserted to
// resolve narrow rather than wide.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { ROLE_SCOPES, PERMISSIONS, resolveRoleScope } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { env } from '../src/config/env.js'
import { hasUnscopedAccess, scopedUserIdsFor } from '../src/services/access/actorScope.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const stamp = String(Date.now()).slice(-11)
let seq = 0

const DEPT_A = `ScopeTestA-${stamp}`
const DEPT_B = `ScopeTestB-${stamp}`

let employeeRole
let supervisorRole
let unscopedRole
let supervisor
let colleague
let outsider
const created = []

async function makeUser({ department, roleId, name }) {
  const user = await User.create({
    firstName: name,
    lastName: 'Scope',
    fullName: `${name} Scope`,
    jshshir: `33${seq++}${stamp}`,
    passwordHash: await hashPassword('ScopeTest123!'),
    roleId,
    department,
  })
  created.push(user._id)
  return user
}

function tokenFor(user, role, { omitScope = false } = {}) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      roleId: role._id.toString(),
      roleName: role.name,
      permissions: role.permissions,
      ...(omitScope ? {} : { scope: resolveRoleScope(role) }),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  )
}

async function api(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

describe('AT-21 · a custom role is scoped by its own scope field', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    // Exactly what AT-21 describes: a role somebody created, holding
    // user:read, fenced to a department.
    supervisorRole = await Role.create({
      name: `SUPERVISOR_${stamp}`,
      permissions: [PERMISSIONS.USER_READ],
      scope: ROLE_SCOPES.DEPARTMENT,
    })
    // The same role without a fence, to prove scope is what decides and not
    // the permission.
    unscopedRole = await Role.create({
      name: `AUDITOR_${stamp}`,
      permissions: [PERMISSIONS.USER_READ],
      scope: ROLE_SCOPES.ALL,
    })

    supervisor = await makeUser({ department: DEPT_A, roleId: supervisorRole._id, name: 'Supervisor' })
    colleague = await makeUser({ department: DEPT_A, roleId: employeeRole._id, name: 'Colleague' })
    outsider = await makeUser({ department: DEPT_B, roleId: employeeRole._id, name: 'Outsider' })
  })

  after(async () => {
    await User.deleteMany({ _id: { $in: created } })
    await Role.deleteMany({ _id: { $in: [supervisorRole?._id, unscopedRole?._id].filter(Boolean) } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('the role stores the scope it was created with', async () => {
    const stored = await Role.findById(supervisorRole._id).lean()
    assert.equal(stored.scope, ROLE_SCOPES.DEPARTMENT)
  })

  test('AT-21 · GET /users returns only the actor\'s own department', async () => {
    const { status, body } = await api('/users?limit=100', tokenFor(supervisor, supervisorRole))
    assert.equal(status, 200)
    const names = body.data.items.map((row) => row.fullName)
    assert.ok(names.includes('Colleague Scope'), 'the actor cannot see their own department')
    assert.ok(!names.includes('Outsider Scope'), 'a department-scoped role could read another department')
  })

  test('the same permission with scope ALL does see everyone', async () => {
    // The point of the change: what is read is decided by scope, not by
    // whether the role happens to be called MANAGER.
    const { status, body } = await api('/users?limit=100', tokenFor(supervisor, unscopedRole))
    assert.equal(status, 200)
    const names = body.data.items.map((row) => row.fullName)
    assert.ok(names.includes('Outsider Scope'), 'an ALL-scoped role was fenced')
  })

  test('department options are fenced the same way as the list', async () => {
    const { body } = await api('/users/departments', tokenFor(supervisor, supervisorRole))
    assert.deepEqual(body.data, [DEPT_A])
  })

  test('a token issued before 2.2 — no scope claim — resolves narrow, not wide', async () => {
    // Those tokens stay valid for their fifteen minutes. Reading a missing
    // claim as ALL would hand the company to every custom role for that
    // window.
    const { body } = await api('/users?limit=100', tokenFor(supervisor, supervisorRole, { omitScope: true }))
    const names = body.data.items.map((row) => row.fullName)
    assert.ok(!names.includes('Outsider Scope'), 'a legacy token was treated as unscoped')
  })
})

describe('the scope resolver', () => {
  before(async () => {
    await connectDatabase()
  })

  after(async () => {
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('MANAGER still means department — the refactor must not move an existing fence', () => {
    assert.equal(resolveRoleScope({ name: 'MANAGER' }), ROLE_SCOPES.DEPARTMENT)
    assert.equal(hasUnscopedAccess({ roleName: 'MANAGER', scope: ROLE_SCOPES.DEPARTMENT }), false)
  })

  test('ADMIN and SUPERADMIN are unfenced, as before', () => {
    assert.equal(hasUnscopedAccess({ roleName: 'ADMIN', scope: ROLE_SCOPES.ALL }), true)
    assert.equal(hasUnscopedAccess({ roleName: 'SUPERADMIN', scope: ROLE_SCOPES.ALL }), true)
  })

  test('a role nobody has scoped is SELF, never ALL', () => {
    assert.equal(resolveRoleScope({ name: 'SOME_NEW_ROLE' }), ROLE_SCOPES.SELF)
    assert.equal(resolveRoleScope({ name: 'SOME_NEW_ROLE', scope: 'NONSENSE' }), ROLE_SCOPES.SELF)
    assert.equal(hasUnscopedAccess({ roleName: 'SOME_NEW_ROLE' }), false)
  })

  test('SELF scope resolves to exactly one person', async () => {
    const actor = { id: '000000000000000000001234', roleName: 'EMPLOYEE', scope: ROLE_SCOPES.SELF }
    assert.deepEqual(await scopedUserIdsFor(actor), ['000000000000000000001234'])
  })

  test('ALL scope resolves to no constraint at all', async () => {
    assert.equal(await scopedUserIdsFor({ id: 'x', roleName: 'ADMIN', scope: ROLE_SCOPES.ALL }), null)
  })

  test('a scoped actor with nothing to be scoped to is fenced to nobody, not to everybody', async () => {
    // Fail closed. A DEPARTMENT actor whose department is blank must not
    // fall through to "no filter".
    const actor = { id: '000000000000000000001234', roleName: 'MANAGER', scope: ROLE_SCOPES.DEPARTMENT }
    assert.deepEqual(await scopedUserIdsFor(actor), [])
  })
})
