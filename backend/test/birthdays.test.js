// Portal §9 — the gift button's panel: whose birthday is near.
//
// Windows are ±30 calendar days in UTC and the answer never carries the
// year. Over HTTP because the point is that any employee gets it.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const PASSWORD = 'BirthdayTest123!'
const stamp = String(Date.now()).slice(-9)
const DAY_MS = 86400e3

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

// A birth date whose month/day fall `offsetDays` from today, in some
// past year, so "this year's occurrence" is what the service must find.
function birthDateOffset(offsetDays, yearsAgo = 30) {
  const d = new Date(Date.now() + offsetDays * DAY_MS)
  return new Date(Date.UTC(d.getUTCFullYear() - yearsAgo, d.getUTCMonth(), d.getUTCDate()))
}

async function makeUser(n, extra = {}) {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  assert.ok(role, 'EMPLOYEE role is missing — boot the server against this database once')
  const user = await User.create({
    firstName: `B${n}`,
    lastName: 'Birthday',
    fullName: `B${n} Birthday`,
    jshshir: `18${stamp}${String(n).padStart(3, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    roleId: role._id,
    ...extra,
  })
  created.push(user)
  return user
}

describe('birthdays around today', () => {
  before(async () => {
    await connectDatabase()
    const me = await makeUser(0, { birthDate: birthDateOffset(0) }) // today
    await makeUser(1, { birthDate: birthDateOffset(5), department: 'Sotuv' })
    await makeUser(2, { birthDate: birthDateOffset(-3) })
    await makeUser(3, { birthDate: birthDateOffset(45) }) // outside the window
    await makeUser(4, { birthDate: birthDateOffset(30) }) // the edge, inclusive
    await makeUser(5, { birthDate: birthDateOffset(2), isActive: false }) // gone
    await makeUser(6) // no date on file
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: me.jshshir, password: PASSWORD }),
    })
    assert.equal(status, 200, `login failed: ${JSON.stringify(body)}`)
    token = body.data.accessToken
  })

  after(async () => {
    await User.deleteMany({ _id: { $in: created.map((u) => u._id) } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('upcoming and past, sorted by distance, without the year', async () => {
    const { status, body } = await api('/org/birthdays', { headers: { Authorization: `Bearer ${token}` } })
    assert.equal(status, 200, JSON.stringify(body))
    const ours = (rows) => rows.filter((row) => row.fullName.endsWith(' Birthday'))
    const upcoming = ours(body.data.upcoming)
    const past = ours(body.data.past)

    assert.deepEqual(
      upcoming.map((row) => [row.fullName, row.daysUntil]),
      [['B0 Birthday', 0], ['B1 Birthday', 5], ['B4 Birthday', 30]]
    )
    assert.deepEqual(past.map((row) => [row.fullName, row.daysUntil]), [['B2 Birthday', -3]])

    const b1 = upcoming[1]
    assert.equal(b1.department, 'Sotuv')
    assert.equal(typeof b1.month, 'number')
    assert.equal(typeof b1.day, 'number')
    assert.equal('birthDate' in b1, false)
    assert.equal('year' in b1, false)
  })

  test('needs a session', async () => {
    assert.equal((await api('/org/birthdays')).status, 401)
  })
})
