// Portal §8 — the employee-facing directory and the head-count tree.
//
// Any session may read it, it never carries an identity number or a birth
// year, archived and switched-off accounts are absent, "new" is the last
// 30 days by hire date (creation date when HR left it blank).

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const PASSWORD = 'DirectoryTest123!'
const stamp = String(Date.now()).slice(-9)
const DAY_MS = 86400e3
const BRANCH = `Dir-${stamp}`

const created = []
let token

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

async function makeUser(n, extra = {}) {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  assert.ok(role, 'EMPLOYEE role is missing — boot the server against this database once')
  const user = await User.create({
    firstName: `D${n}`,
    lastName: 'Directory',
    fullName: `D${n} Directory`,
    jshshir: `19${stamp}${String(n).padStart(3, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    roleId: role._id,
    branch: BRANCH,
    ...extra,
  })
  created.push(user)
  return user
}

describe('employee directory', () => {
  before(async () => {
    await connectDatabase()
    const boss = await makeUser(0, { department: 'Sotuv', position: 'Boshliq', hireDate: new Date(Date.now() - 400 * DAY_MS) })
    await makeUser(1, {
      department: 'Sotuv',
      subdivision: 'B2B',
      position: 'Menejer',
      managerId: boss._id,
      phone: '+998900000001',
      birthDate: new Date(Date.UTC(1990, 4, 17)),
      hireDate: new Date(Date.now() - 10 * DAY_MS),
    })
    await makeUser(2, { department: 'IT', position: 'Dasturchi' }) // no hireDate → created now → new
    await makeUser(3, { department: 'IT', isActive: false })
    await makeUser(4, { department: 'IT', terminationDate: new Date() })
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: boss.jshshir, password: PASSWORD }),
    })
    assert.equal(status, 200, `login failed: ${JSON.stringify(body)}`)
    token = body.data.accessToken
  })

  after(async () => {
    await User.deleteMany({ _id: { $in: created.map((u) => u._id) } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  const auth = () => ({ Authorization: `Bearer ${token}` })

  test('lists working people with manager, contact and month/day only', async () => {
    const { status, body } = await api(`/org/directory?branch=${BRANCH}&limit=2`, { headers: auth() })
    assert.equal(status, 200, JSON.stringify(body))
    assert.equal(body.data.total, 3) // 3 and 4 are gone
    assert.equal(body.data.totalPages, 2)
    assert.deepEqual(body.data.items.map((r) => r.fullName), ['D0 Directory', 'D1 Directory'])
    const d1 = body.data.items[1]
    assert.equal(d1.managerName, 'D0 Directory')
    assert.equal(d1.phone, '+998900000001')
    assert.equal(d1.subdivision, 'B2B')
    assert.equal(d1.birthMonth, 5)
    assert.equal(d1.birthDay, 17)
    assert.equal(d1.isNew, true)
    assert.equal(body.data.items[0].isNew, false)
    for (const key of ['jshshir', 'passportSeries', 'birthDate', 'passwordHash']) assert.equal(key in d1, false)

    const page2 = await api(`/org/directory?branch=${BRANCH}&limit=2&page=2`, { headers: auth() })
    assert.deepEqual(page2.body.data.items.map((r) => r.fullName), ['D2 Directory'])
  })

  test('search and the new-hires filter', async () => {
    const search = await api(`/org/directory?branch=${BRANCH}&search=dastur`, { headers: auth() })
    assert.deepEqual(search.body.data.items.map((r) => r.fullName), ['D2 Directory'])
    const fresh = await api(`/org/directory?branch=${BRANCH}&newOnly=true`, { headers: auth() })
    assert.deepEqual(fresh.body.data.items.map((r) => r.fullName), ['D1 Directory', 'D2 Directory'])
    const dept = await api(`/org/directory?branch=${BRANCH}&department=IT`, { headers: auth() })
    assert.deepEqual(dept.body.data.items.map((r) => r.fullName), ['D2 Directory'])
    assert.equal((await api(`/org/directory?page=0`, { headers: auth() })).status, 400)
  })

  test('the structure tree counts working people per branch/department', async () => {
    const { status, body } = await api('/org/structure', { headers: auth() })
    assert.equal(status, 200, JSON.stringify(body))
    const branch = body.data.branches.find((b) => b.name === BRANCH)
    assert.ok(branch, 'our branch is in the tree')
    assert.equal(branch.count, 3)
    assert.deepEqual(
      branch.departments.map((d) => [d.name, d.count, d.subdivisions.map((s) => [s.name, s.count])]),
      [
        ['IT', 1, []],
        ['Sotuv', 2, [['B2B', 1]]],
      ]
    )
  })

  test('needs a session', async () => {
    assert.equal((await api('/org/directory')).status, 401)
    assert.equal((await api('/org/structure')).status, 401)
  })
})
