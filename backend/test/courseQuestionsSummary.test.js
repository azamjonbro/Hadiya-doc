// Admin Q&A (rasn 20) — the per-course question counts behind the page's
// course list. course:update only; a learner's session answers 403.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { CourseQuestion } from '../src/models/courseQuestion.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const PASSWORD = 'QaTest123!'
const stamp = String(Date.now()).slice(-9)

const users = {}
const tokens = {}
let course

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

async function makeUser(key, roleName, n) {
  const role = await Role.findOne({ name: roleName })
  assert.ok(role, `${roleName} role is missing — boot the server against this database once`)
  users[key] = await User.create({
    firstName: key,
    lastName: 'Qa',
    fullName: `${key} Qa`,
    jshshir: `20${stamp}${n}`,
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

describe('course questions summary', () => {
  before(async () => {
    await connectDatabase()
    await makeUser('learner', 'EMPLOYEE', '001')
    await makeUser('admin', 'SUPERADMIN', '002')
    course = await Course.create({
      title: `QA summary ${stamp}`,
      description: 'x',
      slug: `qa-summary-${stamp}`,
      status: 'PUBLISHED',
      createdBy: users.admin._id,
    })
    await CourseQuestion.create({ courseId: course._id, userId: users.learner._id, question: 'One?' })
    await CourseQuestion.create({
      courseId: course._id,
      userId: users.learner._id,
      question: 'Two?',
      answers: [{ userId: users.admin._id, answer: 'Yes' }],
    })
  })

  after(async () => {
    await CourseQuestion.deleteMany({ courseId: course._id })
    await Course.deleteOne({ _id: course._id })
    await User.deleteMany({ _id: { $in: Object.values(users).map((u) => u._id) } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('names the course and counts total and unanswered', async () => {
    const { status, body } = await api('/courses/questions/summary', { headers: { Authorization: `Bearer ${tokens.admin}` } })
    assert.equal(status, 200, JSON.stringify(body))
    const row = body.data.items.find((item) => item.courseId === String(course._id))
    assert.ok(row, 'our course is listed')
    assert.equal(row.title, course.title)
    assert.equal(row.total, 2)
    assert.equal(row.unanswered, 1)
  })

  test('a learner cannot read it', async () => {
    assert.equal((await api('/courses/questions/summary', { headers: { Authorization: `Bearer ${tokens.learner}` } })).status, 403)
    assert.equal((await api('/courses/questions/summary')).status, 401)
  })
})
