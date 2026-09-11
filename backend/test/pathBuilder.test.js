// The trajectory builder (rasm: Struktura / Asosiy / Bildirishnomalar /
// Kirishni boshqarish).
//
// Stages with client-minted ids, BY_DAYS opening days, per-item deadlines,
// the catalogue flag, the default assignment deadline, and the assignment
// notification in the administrator's own wording.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { LearningPath } from '../src/models/learningPath.model.js'
import { PathEnrollment } from '../src/models/pathEnrollment.model.js'
import { Notification } from '../src/models/notification.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { redisConnection } from '../src/config/redis.js'
import { computeItemLocks } from '../src/services/paths/pathSequence.js'
import { sendPathDeadlineReminders } from '../src/services/paths/pathReminders.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const PASSWORD = 'PathTest123!'
const stamp = String(Date.now()).slice(-9)
const DAY = 86400e3

const users = {}
const tokens = {}
const courses = []
let pathId

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
    lastName: 'Path',
    fullName: `${key} Path`,
    jshshir: `22${stamp}${n}`,
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

describe('trajectory builder', () => {
  before(async () => {
    await connectDatabase()
    await makeUser('admin', 'SUPERADMIN', '001')
    await makeUser('learner', 'EMPLOYEE', '002')
    for (const n of [1, 2]) {
      courses.push(
        await Course.create({
          title: `Path course ${n} ${stamp}`,
          description: 'x',
          slug: `path-course-${n}-${stamp}`,
          status: 'PUBLISHED',
          createdBy: users.admin._id,
        })
      )
    }
  })

  after(async () => {
    if (pathId) {
      await PathEnrollment.deleteMany({ pathId })
      await LearningPath.deleteOne({ _id: pathId })
    }
    await CourseAssignment.deleteMany({ userId: users.learner._id })
    await Notification.deleteMany({ userId: { $in: Object.values(users).map((u) => u._id) } })
    await Course.deleteMany({ _id: { $in: courses.map((c) => c._id) } })
    await User.deleteMany({ _id: { $in: Object.values(users).map((u) => u._id) } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('stages, days and deadlines round-trip; BY_DAYS switches sequential off', async () => {
    const stageId = new mongoose.Types.ObjectId().toString()
    const created = await api('/paths', {
      method: 'POST',
      headers: as('admin'),
      body: JSON.stringify({ title: `Trajectory ${stamp}`, status: 'PUBLISHED' }),
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    pathId = created.body.data.id
    assert.equal(created.body.data.orderMode, 'SEQUENTIAL')
    assert.equal(created.body.data.inCatalog, false)
    assert.equal(created.body.data.notifications.assign.enabled, true)

    const updated = await api(`/paths/${pathId}`, {
      method: 'PATCH',
      headers: as('admin'),
      body: JSON.stringify({
        orderMode: 'BY_DAYS',
        sections: [{ id: stageId, title: 'etap 1', order: 0 }],
        items: [
          { refId: String(courses[0]._id), order: 0, sectionId: stageId, startDay: 0, deadlineDays: 7 },
          { refId: String(courses[1]._id), order: 1, sectionId: stageId, startDay: 10 },
        ],
        defaultDeadlineDays: 30,
        tags: ['onboarding'],
        learningTimeMinutes: 120,
        notifications: {
          assign: { enabled: true, subject: 'Yangi: %TITLE%', text: 'Muddat %DUE_DATE% — %LINK%' },
          beforeDeadline: { enabled: true, days: 40 },
          afterDeadline: { enabled: true, days: [1, 3] },
          completionToAdmins: true,
        },
      }),
    })
    assert.equal(updated.status, 200, JSON.stringify(updated.body))
    const path = updated.body.data
    assert.equal(path.sequential, false)
    assert.equal(path.sections[0].id, stageId)
    assert.equal(path.items[0].sectionId, stageId)
    assert.equal(path.items[1].startDay, 10)
    assert.equal(path.items[0].deadlineDays, 7)
    assert.deepEqual(path.notifications.afterDeadline.days, [1, 3])
    assert.equal(path.notifications.beforeDeadline.days, 40)
  })

  test('off the catalogue: invisible to a learner and not self-enrollable, until added', async () => {
    const list = await api('/paths', { headers: as('learner') })
    assert.ok(!list.body.data.items.some((item) => item.id === pathId))
    assert.equal((await api(`/paths/${pathId}/enroll`, { method: 'POST', headers: as('learner') })).status, 403)

    await api(`/paths/${pathId}`, { method: 'PATCH', headers: as('admin'), body: JSON.stringify({ inCatalog: true }) })
    const again = await api('/paths', { headers: as('learner') })
    assert.ok(again.body.data.items.some((item) => item.id === pathId))
    await api(`/paths/${pathId}`, { method: 'PATCH', headers: as('admin'), body: JSON.stringify({ inCatalog: false }) })
  })

  test('assigning uses the default deadline, opens day-10 later, and writes the custom message', async () => {
    const assigned = await api(`/paths/${pathId}/assign`, {
      method: 'POST',
      headers: as('admin'),
      body: JSON.stringify({ userId: String(users.learner._id) }),
    })
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body))

    const enrollment = await PathEnrollment.findOne({ pathId, userId: users.learner._id }).lean()
    const days = Math.round((enrollment.deadline.getTime() - Date.now()) / DAY)
    assert.equal(days, 30, 'the path default of 30 days applies when the assigner names none')

    const first = await CourseAssignment.findOne({ userId: users.learner._id, courseId: courses[0]._id }).lean()
    assert.equal(Math.round((first.deadline.getTime() - Date.now()) / DAY), 7, 'item deadline: 7 days from opening')
    const second = await CourseAssignment.findOne({ userId: users.learner._id, courseId: courses[1]._id }).lean()
    assert.equal(Math.round((second.startAt.getTime() - Date.now()) / DAY), 10, 'day 10 opens in ten days')

    const detail = await api(`/paths/${pathId}`, { headers: as('learner') })
    assert.equal(detail.status, 200)
    const late = detail.body.data.items.find((item) => item.refId === String(courses[1]._id))
    assert.equal(late.locked, true)
    assert.ok(late.opensAt)
    const early = detail.body.data.items.find((item) => item.refId === String(courses[0]._id))
    assert.equal(early.locked, false)

    const note = await Notification.findOne({ userId: users.learner._id, type: 'PATH_ASSIGNED' }).lean()
    assert.ok(note, 'the learner was told')
    assert.equal(note.title, `Yangi: Trajectory ${stamp}`)
    assert.match(note.message, /^Muddat \S.* — .*\/paths\//)
  })

  test('the lock rule reads startDay only in BY_DAYS mode', () => {
    const items = [
      { refId: 'a', order: 0, startDay: 0 },
      { refId: 'b', order: 1, startDay: 5 },
    ]
    const startAt = new Date()
    const byDays = computeItemLocks({ orderMode: 'BY_DAYS', sequential: false, items }, [], { startAt })
    assert.equal(byDays.b.locked, true)
    const free = computeItemLocks({ orderMode: 'FREE', sequential: false, items }, [], { startAt })
    assert.equal(free.b.locked, false)
    const noEnrollment = computeItemLocks({ orderMode: 'BY_DAYS', sequential: false, items }, [])
    assert.equal(noEnrollment.b.locked, false)
  })

  test('deadline reminders: once before, once per N after', async () => {
    // Before: the deadline is 30 days out and the window is 40 → sent once.
    let counts = await sendPathDeadlineReminders()
    const before = await Notification.countDocuments({ userId: users.learner._id, type: 'PATH_DEADLINE_APPROACHING' })
    assert.equal(before, 1)
    counts = await sendPathDeadlineReminders()
    assert.equal(await Notification.countDocuments({ userId: users.learner._id, type: 'PATH_DEADLINE_APPROACHING' }), 1)

    // After: move the deadline four days back → both the 1-day and 3-day reminders, once each.
    await PathEnrollment.updateOne({ pathId, userId: users.learner._id }, { $set: { deadline: new Date(Date.now() - 4 * DAY) } })
    counts = await sendPathDeadlineReminders()
    assert.equal(counts.after, 2)
    assert.equal(await Notification.countDocuments({ userId: users.learner._id, type: 'PATH_OVERDUE' }), 2)
    counts = await sendPathDeadlineReminders()
    assert.equal(counts.after, 0)
  })
})
