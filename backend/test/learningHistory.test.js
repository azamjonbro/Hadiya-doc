// Portal §11 — the learner's own learning-history table.
//
// One row per course, the course's items under it, and every figure derived
// from the same rows that decide completion. Runs against a live backend
// (TEST_BASE_URL) because the point of the endpoint is what a learner is
// allowed to see: their own history, and nobody else's without user:read.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { VideoProgress } from '../src/models/videoProgress.model.js'
import { Assessment } from '../src/models/assessment.model.js'
import { AssessmentAttempt } from '../src/models/assessmentAttempt.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const PASSWORD = 'HistoryTest123!'
const stamp = String(Date.now()).slice(-9)

let learner
let other
let token
const courseIds = []

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    // status is what the caller asserts on
  }
  return { status: res.status, body }
}

const auth = () => ({ Authorization: `Bearer ${token}` })

async function makeUser(prefix, n) {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  assert.ok(role, 'EMPLOYEE role is missing — boot the server against this database once')
  return User.create({
    firstName: prefix,
    lastName: 'History',
    fullName: `${prefix} History`,
    jshshir: `16${stamp}${n}`,
    passwordHash: await hashPassword(PASSWORD),
    roleId: role._id,
  })
}

async function makeCourse(n, extra = {}) {
  const course = await Course.create({
    title: `History ${stamp}-${n}`,
    description: 'x',
    slug: `history-${stamp}-${n}`,
    status: 'PUBLISHED',
    createdBy: learner._id,
  })
  courseIds.push(course._id)
  const topic = await Topic.create({
    courseId: course._id,
    title: 'T',
    slug: `history-t-${stamp}-${n}`,
    order: 1,
    status: 'PUBLISHED',
    createdBy: learner._id,
  })
  await CourseAssignment.create({ userId: learner._id, courseId: course._id, assignedBy: learner._id, ...extra })
  return { course, topic }
}

describe('learning history', () => {
  before(async () => {
    await connectDatabase()
    learner = await makeUser('Learner', '001')
    other = await makeUser('Other', '002')
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: learner.jshshir, password: PASSWORD }),
    })
    assert.equal(status, 200, `login failed: ${JSON.stringify(body)}`)
    token = body.data.accessToken
  })

  after(async () => {
    await CourseAssignment.deleteMany({ userId: { $in: [learner._id, other._id] } })
    await VideoProgress.deleteMany({ userId: learner._id })
    await AssessmentAttempt.deleteMany({ userId: learner._id })
    await Video.deleteMany({ courseId: { $in: courseIds } })
    await Assessment.deleteMany({ courseId: { $in: courseIds } })
    await Topic.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: [learner._id, other._id] } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('rows come from the progress collections, newest activity first', async () => {
    // Course A: a video half watched a week ago, a test failed then passed
    // yesterday. Course B: assigned today, never opened. Course C: a
    // deadline that passed with nothing done.
    const a = await makeCourse('a')
    const video = await Video.create({
      courseId: a.course._id,
      topicId: a.topic._id,
      title: 'V',
      order: 1,
      status: 'PUBLISHED',
      createdBy: learner._id,
    })
    const weekAgo = new Date(Date.now() - 7 * 86400e3)
    const yesterday = new Date(Date.now() - 86400e3)
    await VideoProgress.create({
      userId: learner._id,
      videoId: video._id,
      courseId: a.course._id,
      completionPercent: 50,
      totalWatchedSeconds: 630,
      firstWatchedAt: weekAgo,
      lastWatchedAt: weekAgo,
    })
    const assessment = await Assessment.create({
      courseId: a.course._id,
      topicId: a.topic._id,
      title: 'A',
      status: 'PUBLISHED',
      passScorePercent: 60,
      questions: [{ text: 'q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }],
      createdBy: learner._id,
    })
    const failed = await AssessmentAttempt.create({
      userId: learner._id,
      assessmentId: assessment._id,
      courseId: a.course._id,
      answers: [],
      scorePercent: 40,
      passed: false,
    })
    // Through the driver: mongoose treats createdAt as immutable and would
    // silently drop the $set.
    await AssessmentAttempt.collection.updateOne({ _id: failed._id }, { $set: { createdAt: new Date(yesterday.getTime() - 3600e3) } })
    const passed = await AssessmentAttempt.create({
      userId: learner._id,
      assessmentId: assessment._id,
      courseId: a.course._id,
      answers: [],
      scorePercent: 80,
      passed: true,
    })
    await AssessmentAttempt.collection.updateOne({ _id: passed._id }, { $set: { createdAt: yesterday } })

    const b = await makeCourse('b')
    const c = await makeCourse('c', { deadline: new Date(Date.now() - 3 * 86400e3), assignedAt: new Date(Date.now() - 10 * 86400e3) })

    const { status, body } = await api(`/users/${learner._id}/learning-history?limit=2`, { headers: auth() })
    assert.equal(status, 200, JSON.stringify(body))
    assert.equal(body.data.total, 3)
    assert.equal(body.data.totalPages, 2)
    assert.equal(body.data.items.length, 2)

    // B was assigned just now, so it sorts first; A's last activity was
    // yesterday's attempt; C's date is its assignment, ten days ago.
    const [first, second] = body.data.items
    assert.equal(first.courseId, b.course._id.toString())
    assert.equal(first.status, 'NOT_STARTED')
    assert.equal(first.completionPercent, 0)
    assert.equal(first.scorePercent, null)

    assert.equal(second.courseId, a.course._id.toString())
    assert.equal(second.status, 'IN_PROGRESS')
    assert.equal(second.completionPercent, 50) // (0 for the video + 1 for the test) / 2
    assert.equal(second.scorePercent, 80) // best attempt, not the latest or the first
    assert.equal(second.timeSeconds, 630)
    assert.equal(new Date(second.startedAt).getTime(), weekAgo.getTime())
    assert.equal(new Date(second.lastActivityAt).getTime(), yesterday.getTime())

    const byKind = Object.fromEntries(second.items.map((item) => [item.kind, item]))
    assert.equal(byKind.video.status, 'IN_PROGRESS')
    assert.equal(byKind.video.completionPercent, 50)
    assert.equal(byKind.video.timeSeconds, 630)
    assert.equal(byKind.assessment.status, 'COMPLETED')
    assert.equal(byKind.assessment.scorePercent, 80)

    const page2 = await api(`/users/${learner._id}/learning-history?limit=2&page=2`, { headers: auth() })
    assert.equal(page2.body.data.items.length, 1)
    assert.equal(page2.body.data.items[0].courseId, c.course._id.toString())
    assert.equal(page2.body.data.items[0].status, 'FAILED')
  })

  test('a failed latest attempt paints the test red, not the course', async () => {
    const d = await makeCourse('d')
    const assessment = await Assessment.create({
      courseId: d.course._id,
      topicId: d.topic._id,
      title: 'A',
      status: 'PUBLISHED',
      passScorePercent: 60,
      questions: [{ text: 'q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }],
      createdBy: learner._id,
    })
    await AssessmentAttempt.create({
      userId: learner._id,
      assessmentId: assessment._id,
      courseId: d.course._id,
      answers: [],
      scorePercent: 30,
      passed: false,
    })
    const { body } = await api(`/users/${learner._id}/learning-history?limit=1`, { headers: auth() })
    const row = body.data.items[0]
    assert.equal(row.courseId, d.course._id.toString())
    assert.equal(row.status, 'IN_PROGRESS')
    assert.equal(row.items[0].status, 'FAILED')
    assert.equal(row.items[0].scorePercent, 30)
  })

  test('someone else’s history needs user:read', async () => {
    const { status } = await api(`/users/${other._id}/learning-history`, { headers: auth() })
    assert.equal(status, 403)
    const anon = await api(`/users/${learner._id}/learning-history`)
    assert.equal(anon.status, 401)
    const bad = await api(`/users/${learner._id}/learning-history?page=0`, { headers: auth() })
    assert.equal(bad.status, 400)
  })
})
