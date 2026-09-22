// The report page's «add a filter» chips — department, branch, group,
// manager, account status — narrow who a user-based report is about. They
// are resolved once in reportDataService.build and intersected with the
// role and scope fences, so a builder that never heard of them still
// honours them. That is the property pinned here, on employee-progress.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { ROLE_SCOPES } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Group } from '../src/models/group.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { reportDataService } from '../src/services/reports/reportData.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const userIds = []
let role
let group
let sales
let store
let manager

// An unscoped actor: the fences under test are the filters, not the scope.
const actor = () => ({ id: manager._id.toString(), permissions: ['report:export'], roleName: role.name, scope: ROLE_SCOPES.ALL })

async function makeUser(name, extra = {}) {
  const [firstName, lastName] = name.split(' ')
  const user = await User.create({
    firstName,
    lastName,
    fullName: name,
    jshshir: `3${stamp}${String(userIds.length).padStart(4, '0')}`.slice(0, 14),
    passwordHash: await hashPassword('ReportTest123!'),
    roleId: role._id,
    ...extra,
  })
  userIds.push(user._id)
  return user
}

const namesOf = (result) => result.rows.map((row) => row.fullName)

describe('report filters · who the report is about', () => {
  before(async () => {
    await connectDatabase()
    role = await Role.create({ name: `RF_${stamp}`, permissions: ['report:export'], scope: ROLE_SCOPES.ALL })
    manager = await makeUser(`Manager ${stamp}`, { department: `Head ${stamp}` })
    sales = await makeUser(`Sales ${stamp}`, { department: `Sales ${stamp}`, branch: `Toshkent ${stamp}`, managerId: manager._id })
    store = await makeUser(`Store ${stamp}`, { department: `Store ${stamp}`, branch: `Buxoro ${stamp}`, isActive: false })
    group = await Group.create({ name: `G ${stamp}`, memberIds: [store._id], createdBy: manager._id })
  })

  after(async () => {
    await Group.deleteOne({ _id: group._id })
    await User.deleteMany({ _id: { $in: userIds } })
    await Role.deleteOne({ _id: role._id })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  test('department', async () => {
    const result = await reportDataService.build(actor(), 'employee-progress', { department: `Sales ${stamp}` })
    assert.deepEqual(namesOf(result), [sales.fullName])
  })

  test('branch', async () => {
    const result = await reportDataService.build(actor(), 'employee-progress', { branch: `Buxoro ${stamp}` })
    assert.deepEqual(namesOf(result), [store.fullName])
  })

  test('group', async () => {
    const result = await reportDataService.build(actor(), 'employee-progress', { groupId: group._id.toString() })
    assert.deepEqual(namesOf(result), [store.fullName])
  })

  test('manager', async () => {
    const result = await reportDataService.build(actor(), 'employee-progress', { managerId: manager._id.toString() })
    assert.deepEqual(namesOf(result), [sales.fullName])
  })

  test('last login and account creation dates', async () => {
    await User.updateOne({ _id: sales._id }, { $set: { lastLoginAt: new Date('2026-01-15') } })
    const jan = await reportDataService.build(actor(), 'employee-progress', { lastLoginFrom: new Date('2026-01-01'), lastLoginTo: new Date('2026-01-31') })
    assert.deepEqual(namesOf(jan), [sales.fullName])
    const future = await reportDataService.build(actor(), 'employee-progress', { createdFrom: new Date(Date.now() + 864e5) })
    assert.equal(future.rows.length, 0)
  })

  test('the record\'s own fields: position as a substring, gender, hire date', async () => {
    await User.updateOne({ _id: sales._id }, { $set: { position: 'Senior seller', gender: 'FEMALE', hireDate: new Date('2025-03-01') } })
    assert.deepEqual(namesOf(await reportDataService.build(actor(), 'employee-progress', { position: 'SELLER' })), [sales.fullName])
    assert.deepEqual(namesOf(await reportDataService.build(actor(), 'employee-progress', { gender: 'FEMALE' })), [sales.fullName])
    assert.deepEqual(
      namesOf(await reportDataService.build(actor(), 'employee-progress', { hireFrom: new Date('2025-01-01'), hireTo: new Date('2025-12-31') })),
      [sales.fullName]
    )
  })

  test('the matrix line and the second phone number', async () => {
    await User.updateOne({ _id: store._id }, { $set: { functionalManagerId: manager._id, mobilePhone: `+99890${stamp}` } })
    const byFunctional = await reportDataService.build(actor(), 'employee-progress', { functionalManagerId: manager._id.toString() })
    assert.deepEqual(namesOf(byFunctional), [store.fullName])
    // The line manager and the functional one are different fields: Sales
    // reports to the manager, Store only does their work.
    const byLine = await reportDataService.build(actor(), 'employee-progress', { managerId: manager._id.toString() })
    assert.deepEqual(namesOf(byLine), [sales.fullName])
    const byMobile = await reportDataService.build(actor(), 'employee-progress', { mobilePhone: stamp })
    assert.deepEqual(namesOf(byMobile), [store.fullName])
  })

  test('account status, and filters intersect rather than add up', async () => {
    const inactive = await reportDataService.build(actor(), 'employee-progress', { status: 'inactive', role: role.name })
    assert.deepEqual(namesOf(inactive), [store.fullName])
    // Store is inactive but not in Sales: two filters, nobody left.
    const none = await reportDataService.build(actor(), 'employee-progress', { status: 'inactive', department: `Sales ${stamp}` })
    assert.equal(none.rows.length, 0)
    assert.equal(none.totalRows, 0)
  })
})
