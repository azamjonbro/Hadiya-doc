// 8.5 — the dashboard grew to cover what the platform grew.
//
// Until this, the company dashboard reported on courses, videos, news and
// tasks: the four things that existed when it was written. Assessment,
// certificates, events, learning paths and compliance were all built after
// it, and none of them appeared anywhere on the front page.
//
// The assertions are deltas, not absolutes. This runs against a shared
// development database that other suites are seeding and deleting from at
// the same time, and a test that asserts "there are exactly nine
// certificates" is a test that fails for reasons that have nothing to do
// with the code.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Certificate } from '../src/models/certificate.model.js'
import { Event } from '../src/models/event.model.js'
import { EventRegistration } from '../src/models/eventRegistration.model.js'
import { PathEnrollment } from '../src/models/pathEnrollment.model.js'
import { LearningPath } from '../src/models/learningPath.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { extraCards, extraCharts } from '../src/analytics/dashboardExtra.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-10)
const DAY_MS = 24 * 60 * 60 * 1000

let learner
let path
let pastEvent
const userIds = []
const certificateIds = []
const eventIds = []
const pathIds = []
const enrollmentIds = []

let before_ = null

describe('the dashboard covers the whole platform (8.5)', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')

    learner = await User.create({
      firstName: 'Metric',
      lastName: 'Learner',
      fullName: 'Metric Learner',
      jshshir: `88${stamp}00`,
      passwordHash: await hashPassword('MetricTest123!'),
      roleId: role._id,
    })
    userIds.push(learner._id)

    // The figures before anything of ours exists — everything below is
    // measured against these.
    before_ = await extraCards()
  })

  after(async () => {
    await Promise.all([
      Certificate.deleteMany({ _id: { $in: certificateIds } }),
      EventRegistration.deleteMany({ eventId: { $in: eventIds } }),
      Event.deleteMany({ _id: { $in: eventIds } }),
      PathEnrollment.deleteMany({ _id: { $in: enrollmentIds } }),
      LearningPath.deleteMany({ _id: { $in: pathIds } }),
    ])
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  test('a certificate that expires soon is counted; one that never expires is not', async () => {
    const common = {
      userId: learner._id,
      sourceType: 'MANUAL',
      fullName: learner.fullName,
      sourceTitle: `Metric ${stamp}`,
      issuedAt: new Date(),
    }
    // Distinct sourceIds: {userId, sourceType, sourceId} is unique, which is
    // the guard against issuing the same certificate twice.
    const soon = await Certificate.create({
      ...common,
      serial: `M1-${stamp}`,
      sourceId: new mongoose.Types.ObjectId(),
      validUntil: new Date(Date.now() + 10 * DAY_MS),
    })
    const never = await Certificate.create({
      ...common,
      serial: `M2-${stamp}`,
      sourceId: new mongoose.Types.ObjectId(),
      validUntil: null,
    })
    const distant = await Certificate.create({
      ...common,
      serial: `M3-${stamp}`,
      sourceId: new mongoose.Types.ObjectId(),
      validUntil: new Date(Date.now() + 300 * DAY_MS),
    })
    certificateIds.push(soon._id, never._id, distant._id)

    const now = await extraCards()
    assert.equal(now.certificatesIssued - before_.certificatesIssued, 3)
    // Only the one inside the window. A certificate with no validUntil is
    // valid indefinitely, and counting it as expiring would be a warning
    // about nothing.
    assert.equal(now.certificatesExpiringSoon - before_.certificatesExpiringSoon, 1)
  })

  test('a revoked certificate stops being counted at all', async () => {
    const issued = (await extraCards()).certificatesIssued
    await Certificate.updateOne({ serial: `M2-${stamp}` }, { $set: { revokedAt: new Date() } })
    assert.equal((await extraCards()).certificatesIssued, issued - 1)
  })

  test('only future events are “upcoming”', async () => {
    const past = await Event.create({
      title: `Past ${stamp}`,
      type: 'TRAINING',
      startAt: new Date(Date.now() - 2 * DAY_MS),
      endAt: new Date(Date.now() - 2 * DAY_MS + 3600_000),
      status: 'PUBLISHED',
      createdBy: learner._id,
    })
    const future = await Event.create({
      title: `Future ${stamp}`,
      type: 'TRAINING',
      startAt: new Date(Date.now() + 2 * DAY_MS),
      endAt: new Date(Date.now() + 2 * DAY_MS + 3600_000),
      status: 'PUBLISHED',
      createdBy: learner._id,
    })
    eventIds.push(past._id, future._id)
    pastEvent = past

    const now = await extraCards()
    assert.equal(now.upcomingEvents - before_.upcomingEvents, 1)
  })

  test('turnout counts the people who had a place, not the waiting list', async () => {
    // Two attended, one did not, one never got in. Turnout is 2 of 3 — the
    // person on the waiting list did not fail to show up.
    await EventRegistration.create([
      { eventId: pastEvent._id, userId: learner._id, status: 'ATTENDED' },
      { eventId: pastEvent._id, userId: new mongoose.Types.ObjectId(), status: 'ATTENDED' },
      { eventId: pastEvent._id, userId: new mongoose.Types.ObjectId(), status: 'NO_SHOW' },
      { eventId: pastEvent._id, userId: new mongoose.Types.ObjectId(), status: 'WAITLIST' },
      { eventId: pastEvent._id, userId: new mongoose.Types.ObjectId(), status: 'CANCELLED' },
    ])

    const { eventAttendance } = await extraCharts()
    const row = eventAttendance.find((entry) => entry.title === `Past ${stamp}`)
    assert.ok(row, 'a past event with registrations is missing from the chart')
    assert.equal(row.expected, 3)
    assert.equal(row.attended, 2)
    assert.equal(row.attendancePercent, 66.7)
  })

  test('an event that has not happened yet is not asked about turnout', async () => {
    const { eventAttendance } = await extraCharts()
    assert.ok(!eventAttendance.some((entry) => entry.title === `Future ${stamp}`))
  })

  test('learning path progress reaches the dashboard', async () => {
    path = await LearningPath.create({
      title: `Metric path ${stamp}`,
      slug: `metric-path-${stamp}`,
      createdBy: learner._id,
    })
    pathIds.push(path._id)

    const enrolments = await PathEnrollment.create([
      { userId: learner._id, pathId: path._id, status: 'ACTIVE', completionPercent: 40 },
      { userId: new mongoose.Types.ObjectId(), pathId: path._id, status: 'COMPLETED', completionPercent: 100 },
    ])
    enrollmentIds.push(...enrolments.map((row) => row._id))

    const cards = await extraCards()
    assert.equal(cards.pathEnrollmentsActive - before_.pathEnrollmentsActive, 1)
    assert.equal(cards.pathEnrollmentsCompleted - before_.pathEnrollmentsCompleted, 1)

    const { pathProgress } = await extraCharts()
    const row = pathProgress.find((entry) => entry.title === `Metric path ${stamp}`)
    assert.ok(row, 'a path with two learners is missing from the chart')
    assert.equal(row.learners, 2)
    assert.equal(row.completed, 1)
    assert.equal(row.avgCompletion, 70)
  })

  test('the certificate trend is a continuous six months, gaps included', async () => {
    const { certificatesByMonth } = await extraCharts()
    assert.equal(certificatesByMonth.length, 6)
    // A month with nothing in it is a zero, not a missing point: a gap in a
    // trend line reads as missing information rather than as nothing having
    // happened.
    assert.ok(certificatesByMonth.every((point) => typeof point.count === 'number'))
    const months = certificatesByMonth.map((point) => point.month)
    assert.deepEqual([...months].sort(), months, 'the months are out of order')
  })

  test('a fresh install renders: no attempts is 0%, never NaN', async () => {
    const cards = await extraCards()
    assert.ok(Number.isFinite(cards.quizPassRatePercent))
    assert.ok(cards.quizPassRatePercent >= 0 && cards.quizPassRatePercent <= 100)
  })
})
