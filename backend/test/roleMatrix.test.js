// 2.4 — the three specialist roles, and the §8.2 matrix they come from.
//
// The reason these exist: until now the only way to let somebody write a
// course was to make them an ADMIN, which hands them every employee record
// with it. AUTHOR, INSTRUCTOR and MENTOR each do one job with courses and
// none of them is a general administrator.
//
// The assertions below are mostly boundaries rather than grants — what each
// role must *not* have. A permission set is easy to widen by accident and
// nothing fails when you do; the only thing that catches it is saying out
// loud where the edge is.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  ROLES,
  PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLE_SCOPES,
  ROLE_SCOPES,
} from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { Role } from '../src/models/role.model.js'
import { Permission } from '../src/models/permission.model.js'

const has = (role, permission) => DEFAULT_ROLE_PERMISSIONS[role].includes(permission)

describe('the permission catalogue', () => {
  test('every key a role is seeded with actually exists', () => {
    const known = new Set(ALL_PERMISSIONS)
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const key of keys) {
        assert.ok(known.has(key), `${role} is seeded with an unknown permission: ${key}`)
      }
    }
  })

  test('no role is seeded with the same key twice', () => {
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      assert.equal(new Set(keys).size, keys.length, `${role} holds a duplicate permission`)
    }
  })

  test('SUPERADMIN holds every key there is', () => {
    assert.equal(DEFAULT_ROLE_PERMISSIONS[ROLES.SUPERADMIN].length, ALL_PERMISSIONS.length)
  })
})

describe('the three new roles', () => {
  test('all three are seeded roles with a scope', () => {
    for (const role of [ROLES.AUTHOR, ROLES.INSTRUCTOR, ROLES.MENTOR]) {
      assert.ok(DEFAULT_ROLE_PERMISSIONS[role], `${role} has no permission set`)
      assert.ok(DEFAULT_ROLE_SCOPES[role], `${role} has no scope`)
    }
  })

  test('AUTHOR writes content and touches no employee records', () => {
    assert.ok(has(ROLES.AUTHOR, PERMISSIONS.COURSE_CREATE))
    assert.ok(has(ROLES.AUTHOR, PERMISSIONS.QUESTION_MANAGE))
    assert.ok(has(ROLES.AUTHOR, PERMISSIONS.MEDIA_MANAGE))
    assert.ok(!has(ROLES.AUTHOR, PERMISSIONS.USER_READ), 'an author could read employee records')
    assert.ok(!has(ROLES.AUTHOR, PERMISSIONS.USER_CREATE))
    assert.equal(DEFAULT_ROLE_SCOPES[ROLES.AUTHOR], ROLE_SCOPES.SELF)
  })

  test('AUTHOR may write a course but not publish or delete one', () => {
    // Writing the material and deciding the company must take it are
    // different decisions, and §8.2 marks publish and delete as admin-only.
    assert.ok(has(ROLES.AUTHOR, PERMISSIONS.COURSE_UPDATE))
    assert.ok(!has(ROLES.AUTHOR, PERMISSIONS.COURSE_PUBLISH), 'an author could publish to the whole company')
    assert.ok(!has(ROLES.AUTHOR, PERMISSIONS.COURSE_DELETE))
  })

  test('INSTRUCTOR runs sessions and marks work, but does not write material', () => {
    assert.ok(has(ROLES.INSTRUCTOR, PERMISSIONS.EVENT_ATTENDANCE_MARK))
    assert.ok(has(ROLES.INSTRUCTOR, PERMISSIONS.QUIZ_GRADE))
    assert.ok(has(ROLES.INSTRUCTOR, PERMISSIONS.COURSE_ASSIGN))
    assert.ok(!has(ROLES.INSTRUCTOR, PERMISSIONS.COURSE_CREATE), 'an instructor could author courses')
    assert.ok(!has(ROLES.INSTRUCTOR, PERMISSIONS.USER_READ))
    assert.equal(DEFAULT_ROLE_SCOPES[ROLES.INSTRUCTOR], ROLE_SCOPES.SELF)
  })

  test('MENTOR is the only one of the three that reads people — and is scoped to a team', () => {
    // The pairing is the point: user:read without a fence is the company.
    assert.ok(has(ROLES.MENTOR, PERMISSIONS.USER_READ))
    assert.ok(has(ROLES.MENTOR, PERMISSIONS.DEVPLAN_MANAGE))
    assert.ok(has(ROLES.MENTOR, PERMISSIONS.OJT_OBSERVE))
    assert.equal(DEFAULT_ROLE_SCOPES[ROLES.MENTOR], ROLE_SCOPES.TEAM)
    assert.ok(!has(ROLES.MENTOR, PERMISSIONS.USER_UPDATE), 'a mentor could edit employee records')
    assert.ok(!has(ROLES.MENTOR, PERMISSIONS.COURSE_CREATE))
  })

  test('none of the three can manage roles, settings or integrations', () => {
    for (const role of [ROLES.AUTHOR, ROLES.INSTRUCTOR, ROLES.MENTOR]) {
      for (const key of [
        PERMISSIONS.ROLE_MANAGE,
        PERMISSIONS.SETTINGS_MANAGE,
        PERMISSIONS.BRANDING_MANAGE,
        PERMISSIONS.INTEGRATION_MANAGE,
        PERMISSIONS.AUDIT_READ,
        PERMISSIONS.USER_DELETE,
      ]) {
        assert.ok(!has(role, key), `${role} holds ${key}`)
      }
    }
  })
})

describe('the existing roles', () => {
  test('ADMIN has everything except the four SUPERADMIN-only keys', () => {
    const admin = new Set(DEFAULT_ROLE_PERMISSIONS[ROLES.ADMIN])
    const withheld = ALL_PERMISSIONS.filter((key) => !admin.has(key))
    assert.deepEqual(withheld.sort(), [
      PERMISSIONS.BRANDING_MANAGE,
      PERMISSIONS.INTEGRATION_MANAGE,
      PERMISSIONS.ROLE_MANAGE,
      PERMISSIONS.SETTINGS_MANAGE,
    ].sort())
  })

  test('MANAGER did not quietly gain anything an admin has and it should not', () => {
    // §8.2 marks MANAGER `·` on these: they are company-wide decisions, and
    // the fence in 2.2 is about *who* a manager sees, not *what* they may do.
    for (const key of [
      PERMISSIONS.COURSE_CREATE,
      PERMISSIONS.COURSE_PUBLISH,
      PERMISSIONS.COURSE_DELETE,
      PERMISSIONS.PATH_MANAGE,
      PERMISSIONS.QUESTION_MANAGE,
      PERMISSIONS.CERTIFICATE_ISSUE,
      PERMISSIONS.USER_IMPORT,
      PERMISSIONS.ONBOARDING_MANAGE,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.AI_GENERATE,
    ]) {
      assert.ok(!has(ROLES.MANAGER, key), `MANAGER holds ${key}`)
    }
  })

  test('EMPLOYEE only gained things it does to its own learning', () => {
    for (const key of [
      PERMISSIONS.ASSIGNMENT_SUBMIT,
      PERMISSIONS.CERTIFICATE_READ_OWN,
      PERMISSIONS.EVENT_REGISTER,
      PERMISSIONS.KB_READ,
      PERMISSIONS.REVIEW360_RESPOND,
      PERMISSIONS.DEVPLAN_READ_OWN,
    ]) {
      assert.ok(has(ROLES.EMPLOYEE, key), `EMPLOYEE is missing ${key}`)
    }
    for (const key of [
      PERMISSIONS.CERTIFICATE_READ_ALL,
      PERMISSIONS.ASSIGNMENT_GRADE,
      PERMISSIONS.REVIEW360_RESULTS_VIEW,
      PERMISSIONS.DEVPLAN_MANAGE,
      PERMISSIONS.REPORT_VIEW,
    ]) {
      assert.ok(!has(ROLES.EMPLOYEE, key), `EMPLOYEE holds ${key}`)
    }
  })
})

describe('what the seed actually wrote', () => {
  before(async () => {
    await connectDatabase()
  })

  after(async () => {
    await mongoose.connection.close()
  })

  test('the three roles exist in the database with the right scope', async () => {
    // Boot writes them; a fresh install and an upgraded one both have to
    // end up here.
    for (const name of [ROLES.AUTHOR, ROLES.INSTRUCTOR, ROLES.MENTOR]) {
      const role = await Role.findOne({ name }).lean()
      assert.ok(role, `${name} was not seeded — boot the server against this database`)
      assert.equal(role.isSystem, true)
      assert.equal(role.scope, DEFAULT_ROLE_SCOPES[name])
      assert.equal(role.permissions.length, DEFAULT_ROLE_PERMISSIONS[name].length)
    }
  })

  test('the catalogue collection holds every key', async () => {
    assert.equal(await Permission.countDocuments(), ALL_PERMISSIONS.length)
  })

  test('a new key is grouped by its module prefix, so the grid can section it', async () => {
    const row = await Permission.findOne({ key: PERMISSIONS.KB_PUBLISH }).lean()
    assert.ok(row, 'kb:publish was not seeded')
    assert.equal(row.module, 'kb')
  })
})
