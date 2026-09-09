// 0.9 — the four N+1 sites, and the thing that makes them testable.
//
// An N+1 is invisible to an ordinary test: the answer is correct either way,
// only the number of round trips differs. So these tests count the queries
// instead of only checking the output, and the assertion is not "few queries"
// but "the same number of queries for a big batch as for a small one" — which
// is the actual property, and the one that stops the bug creeping back in
// when someone adds a lookup inside the loop again.
//
// Mongoose's debug hook is the meter: it fires once per command actually sent
// to MongoDB, with the collection and method, so findById (findOne) and a
// batched $in read (find) are told apart without touching the driver.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { ROLE_SCOPES, PERMISSIONS } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Video } from '../src/models/video.model.js'
import { Topic } from '../src/models/topic.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { PointsLedger } from '../src/models/pointsLedger.model.js'
import { Notification } from '../src/models/notification.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { runDeadlineChecks } from '../src/jobs/reminderJob.js'
import { pointsService } from '../src/services/gamification/points.service.js'
import { videoRepository } from '../src/repositories/video.repository.js'
import { computeDashboard } from '../src/analytics/dashboardAggregation.js'
import { employeeInsightsService } from '../src/services/analytics/employeeInsights.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-10)
const DEPARTMENT = `NPlus${stamp}`
const HOURS_12 = 12 * 60 * 60 * 1000

let seq = 0
const userIds = []
const courseIds = []
const topicIds = []

// ---------------------------------------------------------------- the meter

let tape = null
mongoose.set('debug', (collection, method) => {
  if (tape) tape.push(`${collection}.${method}`)
})

async function measure(fn) {
  tape = []
  let value
  try {
    value = await fn()
  } finally {
    tape = tape ?? []
  }
  const ops = tape
  tape = null
  return {
    value,
    ops,
    count: (label) => ops.filter((op) => op === label).length,
  }
}

// ---------------------------------------------------------------- fixtures

async function makeUser(name, extra = {}) {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  const user = await User.create({
    firstName: name,
    lastName: 'NPlus',
    fullName: `${name} NPlus`,
    jshshir: `77${String(seq++).padStart(2, '0')}${stamp}`,
    passwordHash: await hashPassword('NPlusTest123!'),
    roleId: role._id,
    department: DEPARTMENT,
    ...extra,
  })
  userIds.push(user._id)
  return user
}

let author

async function makeCourse(title) {
  const course = await Course.create({
    title,
    slug: `n-plus-one-${stamp}-${seq++}`,
    description: 'N+1 fixture',
    status: 'PUBLISHED',
    createdBy: author._id,
  })
  courseIds.push(course._id)
  return course
}

/** A course with one topic and two videos, one of them still a draft. */
async function makeCourseWithVideos(title) {
  const course = await makeCourse(title)
  const topic = await Topic.create({
    courseId: course._id,
    title: `${title} topic`,
    slug: `topic-${stamp}-${seq++}`,
    createdBy: author._id,
  })
  topicIds.push(topic._id)
  for (const status of ['PUBLISHED', 'DRAFT']) {
    await Video.create({
      courseId: course._id,
      topicId: topic._id,
      title: `${title} ${status}`,
      status,
      duration: 60,
      createdBy: author._id,
    })
  }
  return course
}

/** `count` employees, each with an ACTIVE assignment whose deadline is tomorrow. */
async function seedApproachingBatch(course, count) {
  const users = []
  for (let i = 0; i < count; i += 1) users.push(await makeUser(`Batch${seq}`))
  await CourseAssignment.insertMany(
    users.map((user) => ({
      userId: user._id,
      courseId: course._id,
      assignedBy: author._id,
      status: 'ACTIVE',
      deadline: new Date(Date.now() + HOURS_12),
      deadlineReminderSentAt: null,
    }))
  )
  return users
}

const adminActor = { id: null, scope: ROLE_SCOPES.ALL, permissions: [PERMISSIONS.ANALYTICS_VIEW_ALL] }
const employeeActor = { id: null, scope: ROLE_SCOPES.SELF, permissions: [] }

describe('N+1 query fixes (0.9)', () => {
  let course

  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')
    author = await makeUser('Admin')
    adminActor.id = author._id.toString()
    employeeActor.id = author._id.toString()
    course = await makeCourse(`N+1 course ${stamp}`)
  })

  after(async () => {
    await Promise.all([
      CourseAssignment.deleteMany({ courseId: { $in: courseIds } }),
      PointsLedger.deleteMany({ userId: { $in: userIds } }),
      Notification.deleteMany({ userId: { $in: userIds } }),
      Video.deleteMany({ courseId: { $in: courseIds } }),
      Topic.deleteMany({ _id: { $in: topicIds } }),
      Course.deleteMany({ _id: { $in: courseIds } }),
    ])
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.disconnect()
    await redisConnection.quit()
  })

  // --------------------------------------------------------- reminder sweep

  describe('the deadline sweep', () => {
    let small
    let large

    before(async () => {
      // Drained first, so whatever the development database already had
      // pending is stamped and cannot be counted as part of either batch.
      await runDeadlineChecks()

      await seedApproachingBatch(course, 3)
      small = await measure(() => runDeadlineChecks())

      await seedApproachingBatch(course, 12)
      large = await measure(() => runDeadlineChecks())
    })

    test('reads the courses once per sweep, not once per assignment', () => {
      assert.equal(small.count('courses.find'), 1)
      assert.equal(large.count('courses.find'), 1)
      assert.equal(small.count('courses.findOne'), 0)
      assert.equal(large.count('courses.findOne'), 0)
    })

    test('stamps the whole batch in one write', () => {
      assert.equal(small.count('courseassignments.updateMany'), 1)
      assert.equal(large.count('courseassignments.updateMany'), 1)
      assert.equal(large.count('courseassignments.save'), 0)
    })

    test('reads the recipients once, however many of them there are', () => {
      // findOne is the per-notification recipient read notifyMany replaced.
      assert.equal(small.count('users.find'), large.count('users.find'))
      assert.equal(small.count('users.findOne'), large.count('users.findOne'))
    })

    test('four times the batch is not four times the queries', () => {
      // The whole point, stated as one number: 12 assignments must not cost
      // meaningfully more round trips than 3.
      assert.ok(
        large.ops.length <= small.ops.length + 12,
        `3 assignments: ${small.ops.length} ops, 12 assignments: ${large.ops.length} ops`
      )
    })

    test('and everyone in the batch was actually told', async () => {
      const sent = await Notification.countDocuments({
        userId: { $in: userIds },
        type: 'COURSE_DEADLINE_APPROACHING',
      })
      assert.equal(sent, 15)
      const unstamped = await CourseAssignment.countDocuments({
        courseId: course._id,
        deadlineReminderSentAt: null,
      })
      assert.equal(unstamped, 0)
    })
  })

  // -------------------------------------------------------- videos by course

  describe("an employee's assigned videos", () => {
    let extraCourses

    before(async () => {
      extraCourses = [
        await makeCourseWithVideos(`N+1 a ${stamp}`),
        await makeCourseWithVideos(`N+1 b ${stamp}`),
        await makeCourseWithVideos(`N+1 c ${stamp}`),
      ]
    })

    test('listByCourses is one query for every course', async () => {
      const ids = extraCourses.map((c) => c._id.toString())
      const { value, count } = await measure(() => videoRepository.listByCourses(ids))
      assert.equal(count('videos.find'), 1)
      assert.equal(value.length, 6)
    })

    test('an empty list asks the database nothing at all', async () => {
      const { value, ops } = await measure(() => videoRepository.listByCourses([]))
      assert.deepEqual(value, [])
      assert.equal(ops.length, 0)
    })

    test('the performance report reads videos once, not once per assignment', async () => {
      const subject = await makeUser('Subject')
      await CourseAssignment.insertMany(
        extraCourses.map((c) => ({
          userId: subject._id,
          courseId: c._id,
          assignedBy: author._id,
          status: 'ACTIVE',
        }))
      )
      const { count } = await measure(() =>
        employeeInsightsService.getPerformance(adminActor, subject._id.toString())
      )
      assert.equal(count('videos.find'), 1)
    })
  })

  // ------------------------------------------------------------ leaderboard

  describe('the leaderboard', () => {
    let board

    before(async () => {
      const earners = []
      for (let i = 0; i < 8; i += 1) earners.push(await makeUser(`Earner${i}`))
      // Four more with no ledger row at all — the "has done nothing" case.
      for (let i = 0; i < 4; i += 1) await makeUser(`Idle${i}`)

      await PointsLedger.insertMany(
        earners.map((user, i) => ({
          userId: user._id,
          courseId: course._id,
          points: (i + 1) * 10,
          source: 'COMPLETION',
          videoId: new mongoose.Types.ObjectId(),
        }))
      )
      board = await measure(() =>
        pointsService.getLeaderboard(adminActor, { department: DEPARTMENT, limit: 5 })
      )
    })

    test('is one aggregation, with no per-row user lookup in Node', () => {
      assert.equal(board.count('pointsledgers.aggregate'), 1)
      // No user reads at all: the employee fields the board shows come from
      // a $lookup inside the same aggregation, and an unscoped actor needs no
      // department lookup of their own.
      assert.equal(board.count('users.find'), 0)
      assert.equal(board.count('users.findOne'), 0)
    })

    test('ranks by points and cuts at the limit inside the database', () => {
      const rows = board.value.rows
      assert.equal(rows.length, 5)
      assert.deepEqual(
        rows.map((r) => r.totalPoints),
        [80, 70, 60, 50, 40]
      )
      assert.deepEqual(
        rows.map((r) => r.rank),
        [1, 2, 3, 4, 5]
      )
      assert.equal(board.value.totalRanked, 8)
    })

    test('a bigger department is not more queries', async () => {
      const more = []
      for (let i = 0; i < 20; i += 1) more.push(await makeUser(`Extra${i}`))
      await PointsLedger.insertMany(
        more.map((user, i) => ({
          userId: user._id,
          courseId: course._id,
          points: i + 1,
          source: 'QUIZ',
        }))
      )
      const bigger = await measure(() =>
        pointsService.getLeaderboard(adminActor, { department: DEPARTMENT, limit: 5 })
      )
      assert.equal(bigger.ops.length, board.ops.length)
      assert.equal(bigger.value.totalRanked, 28)
      assert.equal(bigger.value.rows.length, 5)
      assert.equal(bigger.value.rows[0].totalPoints, 80)
    })

    test('includeZero fills the page with the people who have done nothing', async () => {
      const { value, count } = await measure(() =>
        pointsService.getLeaderboard(adminActor, { department: DEPARTMENT, limit: 40, includeZero: true })
      )
      // 28 earners + 4 idle + the admin and the report subject seeded above.
      assert.equal(value.totalRanked, await User.countDocuments({ department: DEPARTMENT, isActive: true }))
      assert.ok(value.rows.some((r) => r.totalPoints === 0))
      assert.equal(value.rows.at(-1).totalPoints, 0)
      // One aggregation, one count, one page of the idle — not one per person.
      assert.equal(count('pointsledgers.aggregate'), 1)
      assert.equal(count('users.find'), 1)
      assert.equal(count('users.countDocuments'), 1)
    })

    test('an employee still gets no JSHSHIR and no filter', async () => {
      const { value } = await measure(() =>
        pointsService.getLeaderboard(employeeActor, { department: DEPARTMENT, limit: 5, includeZero: true })
      )
      assert.ok(value.rows.length > 0)
      for (const row of value.rows) {
        assert.ok(!('jshshir' in row), 'JSHSHIR must not reach an ordinary employee')
        assert.ok(row.totalPoints > 0, 'includeZero is a management-only option')
      }
    })
  })

  // -------------------------------------------------------------- dashboard

  describe('the company dashboard', () => {
    test('buckets employees in the database, not by loading all of them', async () => {
      const { value, count } = await measure(() => computeDashboard())
      assert.equal(count('users.aggregate'), 1)
      assert.equal(count('users.find'), 0, 'User.find({}) is what this replaced')

      const buckets = value.charts.employeeProgress
      assert.deepEqual(
        buckets.map((b) => b.bucket),
        ['0-25', '25-50', '50-75', '75-100']
      )
      const total = buckets.reduce((sum, b) => sum + b.count, 0)
      assert.equal(total, await User.countDocuments(), 'every employee lands in exactly one bucket')
    })
  })
})
