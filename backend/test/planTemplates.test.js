// Rasn 12–14 — plan types, plan templates, and assigning a template.
//
// Two types are seeded and locked; a template is a plan without a person;
// assigning it makes one DRAFT plan per person with the goals copied and
// their dates offset from the start. Over HTTP: devplan:manage gates all.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { DevelopmentPlan } from '../src/models/developmentPlan.model.js'
import { DevelopmentPlanTemplate } from '../src/models/developmentPlanTemplate.model.js'
import { DevelopmentPlanType } from '../src/models/developmentPlanType.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const PASSWORD = 'TemplateTest123!'
const stamp = String(Date.now()).slice(-9)

const users = {}
const tokens = {}
let typeId
let templateId

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } })
  let body = null
  try {
    body = await res.json()
  } catch {
    // status is what the caller asserts on
  }
  return { status: res.status, body }
}

const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` })

async function makeUser(key, roleName, n) {
  const role = await Role.findOne({ name: roleName })
  assert.ok(role, `${roleName} role is missing — boot the server against this database once`)
  users[key] = await User.create({
    firstName: key,
    lastName: 'Tpl',
    fullName: `${key} Tpl`,
    jshshir: `21${stamp}${n}`,
    passwordHash: await hashPassword(PASSWORD),
    roleId: role._id,
  })
  const { status, body } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: users[key].jshshir, password: PASSWORD }),
  })
  assert.equal(status, 200, `login failed: ${JSON.stringify(body)}`)
  tokens[key] = body.data.accessToken
}

describe('plan types and templates', () => {
  before(async () => {
    await connectDatabase()
    await makeUser('admin', 'SUPERADMIN', '001')
    await makeUser('learner', 'EMPLOYEE', '002')
    await makeUser('other', 'EMPLOYEE', '003')
  })

  after(async () => {
    await DevelopmentPlan.deleteMany({ userId: { $in: [users.learner._id, users.other._id] } })
    if (templateId) await DevelopmentPlanTemplate.deleteOne({ _id: templateId })
    if (typeId) await DevelopmentPlanType.deleteOne({ _id: typeId })
    await User.deleteMany({ _id: { $in: Object.values(users).map((u) => u._id) } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('the two built-in types are there and locked', async () => {
    const { status, body } = await api('/development-plans/types', { headers: as('admin') })
    assert.equal(status, 200, JSON.stringify(body))
    const keys = body.data.items.map((item) => item.key)
    assert.ok(keys.includes('IDP') && keys.includes('ADAPTATION'))
    const idp = body.data.items.find((item) => item.key === 'IDP')
    assert.equal(idp.isSystem, true)
    assert.equal(idp.outcomes.length, 2)
    const del = await api(`/development-plans/types/${idp.id}`, { method: 'DELETE', headers: as('admin') })
    assert.equal(del.status, 403)
    assert.equal((await api('/development-plans/types', { headers: as('learner') })).status, 403)
  })

  test('a custom type, a template on it, and plans from the template', async () => {
    const type = await api('/development-plans/types', {
      method: 'POST',
      headers: as('admin'),
      body: JSON.stringify({ name: `Mentor plan ${stamp}`, outcomes: [{ key: 'DONE', label: 'Done' }, { key: 'NOT_DONE', label: 'Not done', positive: false }] }),
    })
    assert.equal(type.status, 201, JSON.stringify(type.body))
    typeId = type.body.data.id

    const template = await api('/development-plans/templates', {
      method: 'POST',
      headers: as('admin'),
      body: JSON.stringify({
        name: `Onboarding ${stamp}`,
        typeId,
        durationDays: 30,
        goals: [
          { type: 'CUSTOM', title: 'Meet the team', dueInDays: 7 },
          { type: 'CUSTOM', title: 'First sale', dueInDays: 30, weight: 3 },
        ],
      }),
    })
    assert.equal(template.status, 201, JSON.stringify(template.body))
    templateId = template.body.data.id

    // The type is in use now, so it cannot go.
    assert.equal((await api(`/development-plans/types/${typeId}`, { method: 'DELETE', headers: as('admin') })).status, 409)

    const start = new Date('2026-10-01T00:00:00.000Z')
    const assigned = await api(`/development-plans/templates/${templateId}/assign`, {
      method: 'POST',
      headers: as('admin'),
      body: JSON.stringify({ userIds: [String(users.learner._id), String(users.other._id), '000000000000000000000000'], periodStart: start.toISOString() }),
    })
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body))
    assert.equal(assigned.body.data.created.length, 2)
    assert.deepEqual(assigned.body.data.skipped, [{ userId: '000000000000000000000000', reason: 'USER_NOT_FOUND' }])

    const plan = await DevelopmentPlan.findOne({ userId: users.learner._id, templateId }).lean()
    assert.ok(plan, 'the plan points back at its template')
    assert.equal(plan.status, 'DRAFT')
    assert.equal(String(plan.typeId), typeId)
    assert.equal(plan.goals.length, 2)
    assert.equal(plan.goals[0].targetDate.toISOString(), new Date(start.getTime() + 7 * 86400e3).toISOString())
    assert.equal(plan.periodEnd.toISOString(), new Date(start.getTime() + 30 * 86400e3).toISOString())

    const list = await api('/development-plans/templates', { headers: as('admin') })
    const row = list.body.data.items.find((item) => item.id === templateId)
    assert.equal(row.assignmentCount, 2)
    assert.equal(row.updatedByName, 'admin Tpl')
  })
})
