// 2.3 — a role's permissions can be changed without deleting it.
//
// Before this, the only way to correct a role was to delete it and make a
// new one — and the API refuses to delete a role anyone holds. So in
// practice a role's permissions were fixed for its lifetime, and the way
// round it was to move every employee off the role, delete it, recreate it,
// and move them all back.
//
// The seeded roles stay locked. An admin who could untick `role:manage` on
// SUPERADMIN would lock everyone out of role management permanently, with no
// way back through the UI.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { PERMISSIONS, ROLE_SCOPES } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { Role } from '../src/models/role.model.js'
import { User } from '../src/models/user.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { roleService } from '../src/services/roles/role.service.js'
import { hashPassword } from '../src/utils/hash.js'

const stamp = String(Date.now()).slice(-11)
const ROLE_NAME = `EDITABLE_${stamp}`
let role
let actor
let holder

describe('editing a role', () => {
  before(async () => {
    await connectDatabase()
    const employee = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employee, 'EMPLOYEE role is missing — boot the server against this database once')

    actor = await User.create({
      firstName: 'Role',
      lastName: 'Editor',
      fullName: 'Role Editor',
      jshshir: `22${stamp}0`,
      passwordHash: await hashPassword('RoleTest123!'),
      roleId: employee._id,
    })
    role = await Role.create({
      name: ROLE_NAME,
      permissions: [PERMISSIONS.COURSE_READ],
      scope: ROLE_SCOPES.SELF,
    })
  })

  after(async () => {
    await AuditLog.deleteMany({ entityId: role._id.toString() })
    await User.deleteMany({ _id: { $in: [actor._id, holder?._id].filter(Boolean) } })
    await Role.deleteOne({ _id: role._id })
    await mongoose.connection.close()
  })

  test('permissions are replaced wholesale, not merged', async () => {
    // The grid sends the complete row. Merging would make unticking a box
    // do nothing, which is the worst possible behaviour for a permission UI:
    // it looks like it worked.
    const updated = await roleService.update(actor, role._id.toString(), {
      permissions: [PERMISSIONS.USER_READ, PERMISSIONS.REPORT_EXPORT],
    })
    assert.deepEqual(updated.permissions.sort(), [PERMISSIONS.REPORT_EXPORT, PERMISSIONS.USER_READ].sort())
    assert.ok(!updated.permissions.includes(PERMISSIONS.COURSE_READ), 'an unticked permission survived')
  })

  test('the change is persisted, not just returned', async () => {
    const stored = await Role.findById(role._id).lean()
    assert.deepEqual(stored.permissions.sort(), [PERMISSIONS.REPORT_EXPORT, PERMISSIONS.USER_READ].sort())
  })

  test('a duplicated key from a double-click is stored once', async () => {
    const updated = await roleService.update(actor, role._id.toString(), {
      permissions: [PERMISSIONS.USER_READ, PERMISSIONS.USER_READ],
    })
    assert.deepEqual(updated.permissions, [PERMISSIONS.USER_READ])
  })

  test('scope can be changed on its own, leaving permissions alone', async () => {
    const updated = await roleService.update(actor, role._id.toString(), { scope: ROLE_SCOPES.DEPARTMENT })
    assert.equal(updated.scope, ROLE_SCOPES.DEPARTMENT)
    assert.deepEqual(updated.permissions, [PERMISSIONS.USER_READ])
  })

  test('the audit entry says what changed, not just that something did', async () => {
    // A permission grant is exactly the kind of change somebody will want to
    // reconstruct months later.
    const entry = await AuditLog.findOne({ entityId: role._id.toString(), action: 'ROLE_UPDATED' })
      .sort({ createdAt: -1 })
      .lean()
    assert.ok(entry, 'no audit entry was written')
    assert.equal(entry.metadata.scope.from, ROLE_SCOPES.SELF)
    assert.equal(entry.metadata.scope.to, ROLE_SCOPES.DEPARTMENT)
  })

  test('the acceptance itself — a role held by someone can still be edited', async () => {
    // The whole point. Deleting is refused while anyone holds the role;
    // editing must not be.
    holder = await User.create({
      firstName: 'Role',
      lastName: 'Holder',
      fullName: 'Role Holder',
      jshshir: `22${stamp}1`,
      passwordHash: await hashPassword('RoleTest123!'),
      roleId: role._id,
    })

    const updated = await roleService.update(actor, role._id.toString(), {
      permissions: [PERMISSIONS.USER_READ, PERMISSIONS.COURSE_READ],
    })
    assert.equal(updated.users, 1, 'the response should report who holds it')
    assert.equal(updated.permissions.length, 2)

    await assert.rejects(() => roleService.remove(actor, role._id.toString()), /still hold this role/)
  })

  for (const name of ['SUPERADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']) {
    test(`${name} is locked — a built-in role cannot be edited`, async () => {
      const systemRole = await Role.findOne({ name })
      await assert.rejects(
        () => roleService.update(actor, systemRole._id.toString(), { permissions: [PERMISSIONS.USER_READ] }),
        (error) => {
          assert.equal(error.code, 'SYSTEM_ROLE_PROTECTED')
          return true
        }
      )
    })
  }

  test('a role that does not exist is a 404, not a silent no-op', async () => {
    await assert.rejects(
      () => roleService.update(actor, new mongoose.Types.ObjectId().toString(), { scope: ROLE_SCOPES.ALL }),
      /not found/i
    )
  })

  test('the permission catalogue is grouped by module and covers everything', async () => {
    const groups = await roleService.listPermissions()
    const keys = groups.flatMap((group) => group.permissions.map((permission) => permission.key))
    assert.ok(groups.length > 1, 'the grid needs more than one section to be worth grouping')
    assert.ok(keys.includes(PERMISSIONS.USER_READ))
    assert.equal(new Set(keys).size, keys.length, 'a permission appears in two modules')
  })
})
