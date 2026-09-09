// 5.5 — dynamic groups.
//
// "Everybody in Maintenance" maintained by hand is a list that is wrong
// within a week: somebody transfers and nobody remembers the group. As a
// rule it is right by construction, and the cost is that `memberIds`
// becomes a cache that has to be rebuilt when people move.
//
// The two things worth pinning down are the refusal (a hand-added member
// would vanish at the next refresh, so adding one is refused rather than
// silently reverted) and the query shape (groups written before this field
// existed must not be swept into a rebuild that empties them).

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Group } from '../src/models/group.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { groupService } from '../src/services/groups/group.service.js'
import { groupMembershipService, matchesGroupRule } from '../src/services/groups/groupMembership.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `Dyn-${stamp}`
const OTHER = `DynOther-${stamp}`

let employeeRole
let admin
let insider
let outsider
let dynamicGroup
let legacyGroup
const userIds = []
const groupIds = []

async function makeUser(name, department) {
  const user = await User.create({
    firstName: name,
    lastName: 'Dyn',
    fullName: `${name} Dyn`,
    jshshir: `50${userIds.length}${stamp}`,
    passwordHash: await hashPassword('DynTest123!'),
    roleId: employeeRole._id,
    department,
  })
  userIds.push(user._id)
  return user
}

describe('dynamic groups (5.5)', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    admin = await makeUser('Admin', DEPT)
    insider = await makeUser('Ichki', DEPT)
    outsider = await makeUser('Tashqi', OTHER)

    dynamicGroup = await Group.create({
      name: `Dynamic ${stamp}`,
      type: 'DYNAMIC',
      rule: { departments: [DEPT] },
      createdBy: admin._id,
    })
    groupIds.push(dynamicGroup._id)

    // Written straight through the driver, with no `type` at all — this is
    // what every group created before 5.5 looks like on disk.
    const inserted = await Group.collection.insertOne({
      name: `Legacy ${stamp}`,
      description: '',
      department: '',
      memberIds: [outsider._id],
      courseIds: [],
      createdBy: admin._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    legacyGroup = inserted.insertedId
    groupIds.push(legacyGroup)
  })

  after(async () => {
    await Group.deleteMany({ _id: { $in: groupIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the rule', () => {
    test('fields combine with AND, values within a field with OR', () => {
      const rule = { departments: [DEPT], positions: ['Welder', 'Fitter'] }
      assert.equal(matchesGroupRule({ department: DEPT, position: 'Fitter' }, rule), true)
      assert.equal(matchesGroupRule({ department: DEPT, position: 'Driver' }, rule), false)
      assert.equal(matchesGroupRule({ department: OTHER, position: 'Welder' }, rule), false)
    })

    test('an empty rule matches nobody rather than everybody', () => {
      // Sweeping in the entire company is occasionally wanted and never
      // wanted by accident.
      assert.equal(matchesGroupRule({ department: DEPT }, {}), false)
    })
  })

  describe('refreshing', () => {
    test('membership comes from the rule', async () => {
      const result = await groupMembershipService.refresh(dynamicGroup._id)
      assert.equal(result.total, 2)
      assert.equal(result.joined, 2)

      const stored = await Group.findById(dynamicGroup._id).lean()
      const ids = stored.memberIds.map(String)
      assert.ok(ids.includes(String(insider._id)))
      assert.ok(!ids.includes(String(outsider._id)))
      assert.ok(stored.membersRefreshedAt, 'staleness is a fact the person looking at it needs')
    })

    test('somebody transferring in joins, and out leaves', async () => {
      await User.updateOne({ _id: outsider._id }, { $set: { department: DEPT } })
      let result = await groupMembershipService.refresh(dynamicGroup._id)
      assert.equal(result.joined, 1)
      assert.equal(result.total, 3)

      await User.updateOne({ _id: outsider._id }, { $set: { department: OTHER } })
      result = await groupMembershipService.refresh(dynamicGroup._id)
      assert.equal(result.left, 1)
      assert.equal(result.total, 2)
    })

    test('a re-run with nothing changed reports no movement', async () => {
      const result = await groupMembershipService.refresh(dynamicGroup._id)
      assert.equal(result.joined, 0)
      assert.equal(result.left, 0)
    })

    test('the sweep leaves a pre-5.5 group alone', async () => {
      // `type: 'DYNAMIC'` rather than `$ne: 'STATIC'` — a negated query
      // would match the missing field and empty a hand-curated group.
      await groupMembershipService.refreshAll()
      const legacy = await Group.findById(legacyGroup).lean()
      assert.equal(legacy.memberIds.length, 1, 'a group with no type must not be rebuilt')
      assert.equal(String(legacy.memberIds[0]), String(outsider._id))
    })

    test('refreshing a static group does nothing', async () => {
      assert.equal(await groupMembershipService.refresh(legacyGroup), null)
    })
  })

  describe('hand edits', () => {
    const actor = () => ({ id: admin._id.toString(), permissions: ['user:read', 'user:update'], roleName: 'SUPERADMIN' })

    test('adding a member to a dynamic group is refused, not reverted', async () => {
      // Allowing it and rebuilding later would make the addition vanish
      // with no explanation.
      await assert.rejects(
        () => groupService.addMembers(actor(), dynamicGroup._id.toString(), [outsider._id.toString()]),
        (error) => error.code === 'GROUP_IS_DYNAMIC'
      )
    })

    test('removing one is refused too', async () => {
      await assert.rejects(
        () => groupService.removeMember(actor(), dynamicGroup._id.toString(), insider._id.toString()),
        (error) => error.code === 'GROUP_IS_DYNAMIC'
      )
    })

    test('editing the rule rebuilds the membership in the same request', async () => {
      await groupService.update(actor(), dynamicGroup._id.toString(), { rule: { departments: [OTHER] } })
      const stored = await Group.findById(dynamicGroup._id).lean()
      // Otherwise the person who just edited it sees the old list and
      // edits it again.
      assert.deepEqual(stored.memberIds.map(String), [String(outsider._id)])
    })
  })

  describe('one person moving', () => {
    test('only the groups whose answer changed are rebuilt', async () => {
      await Group.updateOne({ _id: dynamicGroup._id }, { $set: { rule: { departments: [DEPT] } } })
      await groupMembershipService.refresh(dynamicGroup._id)

      // Nothing moved, so nothing to rebuild.
      let result = await groupMembershipService.refreshForUser(insider._id)
      assert.equal(result.groups, 0)

      await User.updateOne({ _id: insider._id }, { $set: { department: OTHER } })
      result = await groupMembershipService.refreshForUser(insider._id)
      assert.equal(result.groups, 1)

      const stored = await Group.findById(dynamicGroup._id).lean()
      assert.ok(!stored.memberIds.map(String).includes(String(insider._id)))
    })
  })
})
