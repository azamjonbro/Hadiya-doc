// 12.3 / AT-35 — a replayed offline queue must not count twice.
//
// The case, from the acceptance test: somebody watches five minutes of a
// video with no signal, so twelve events sit in a queue on the device.
// The connection returns and the sync runs **twice** — two tabs, or a
// Background Sync retry racing a manual flush. What must happen:
// `uniqueWatchedSeconds` goes up by exactly 300, not 600; the second batch
// is rejected by the `clientEventId` unique index; and the analytics
// collection holds 12 rows, not 24.
//
// Run against the real Mongo, because the mechanism *is* the unique index:
// a mocked repository would be testing the mock.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { VideoProgress } from '../src/models/videoProgress.model.js'
import { VideoAnalyticsEvent } from '../src/models/videoAnalyticsEvent.model.js'
import { VideoSession } from '../src/models/videoSession.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { processVideoEvents } from '../src/analytics/videoEventProcessor.js'
import { videoAnalyticsEventRepository } from '../src/repositories/videoAnalyticsEvent.repository.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let user
let video
let course
let topic

/**
 * Five minutes of watching, as the player actually reports it: `play`, ten
 * `progress` events of thirty seconds each (the player builds those from
 * real timeupdate deltas while playing — they are the only thing that
 * feeds completion), and a `pause`. Twelve events, which is the number
 * AT-35 names. Each carries the id the client generated for it.
 */
function offlineBatch() {
  const start = new Date('2026-09-10T08:00:00.000Z').getTime()
  const events = [{ eventType: 'play', timestamp: new Date(start).toISOString(), position: 0 }]
  for (let i = 0; i < 10; i += 1) {
    events.push({
      eventType: 'progress',
      timestamp: new Date(start + (i + 1) * 30_000).toISOString(),
      position: i * 30,
      duration: 30,
    })
  }
  events.push({ eventType: 'pause', timestamp: new Date(start + 300_000).toISOString(), position: 300 })
  return events.map((event) => ({ ...event, clientEventId: crypto.randomUUID() }))
}

describe('12.3 / AT-35 · a replayed offline queue', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')
    user = await User.create({
      firstName: 'Oflayn',
      lastName: 'Sinxron',
      fullName: 'Sinxron Oflayn',
      jshshir: `12${stamp}001`,
      passwordHash: await hashPassword('SyncTest123!'),
      roleId: role._id,
      department: 'IT',
    })
    course = await Course.create({
      title: `Sync probe ${stamp}`,
      slug: `sync-probe-${stamp}`,
      status: 'PUBLISHED',
      createdBy: user._id,
    })
    topic = await Topic.create({
      courseId: course._id,
      title: 'Mavzu',
      slug: `sync-topic-${stamp}`,
      status: 'PUBLISHED',
      order: 1,
      createdBy: user._id,
    })
    video = await Video.create({
      topicId: topic._id,
      courseId: course._id,
      title: 'Sinov videosi',
      // Ten minutes, so five minutes watched is 50% — well under the
      // completion threshold, which keeps this test about counting.
      duration: 600,
      order: 1,
      status: 'PUBLISHED',
      processingStatus: 'READY',
      createdBy: user._id,
    })
  })

  after(async () => {
    await VideoAnalyticsEvent.deleteMany({ userId: user._id })
    await VideoProgress.deleteMany({ userId: user._id })
    await VideoSession.deleteMany({ userId: user._id })
    await Video.deleteMany({ courseId: course._id })
    await Topic.deleteMany({ courseId: course._id })
    await Course.deleteOne({ _id: course._id })
    await User.deleteOne({ _id: user._id })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('AT-35: the same twelve events, flushed twice, count once', async () => {
    const events = offlineBatch()
    const sessionId = `session-${stamp}`
    const meta = { userId: user._id.toString(), sessionId, videoId: video._id.toString(), device: 'mobile', browser: 'chrome' }

    const first = await processVideoEvents({ ...meta, events })
    assert.equal(first.accepted, 12)
    assert.equal(first.duplicates, 0)
    assert.equal(first.uniqueWatchedSeconds, 300, 'five minutes watched should be 300 seconds')

    // The queue is flushed a second time — the same events, the same ids.
    const second = await processVideoEvents({ ...meta, events })
    assert.equal(second.accepted, 0, 'nothing in the second flush is new')
    assert.equal(second.duplicates, 12)
    // The number this acceptance test exists for.
    assert.equal(second.uniqueWatchedSeconds, 300, 'a replay must not add another 300 seconds')

    const progress = await VideoProgress.findOne({ userId: user._id, videoId: video._id }).lean()
    assert.equal(progress.uniqueWatchedSeconds, 300)
    // Every additive counter, not just the seconds: plays, pauses and the
    // session count would all have doubled without the index.
    assert.equal(progress.playsCount, 1)
    assert.equal(progress.pausesCount, 1)
    assert.equal(progress.sessionsCount, 1)

    const rows = await VideoAnalyticsEvent.countDocuments({ userId: user._id, videoId: video._id })
    assert.equal(rows, 12, 'twelve events, not twenty-four')
  })

  test('a third flush, and one flushed while another is still running', async () => {
    const events = offlineBatch()
    const sessionId = `session-race-${stamp}`
    const meta = { userId: user._id.toString(), sessionId, videoId: video._id.toString(), device: 'mobile', browser: 'chrome' }

    // Two flushes started together: what two tabs actually do, rather than
    // one after the other.
    const [a, b] = await Promise.all([
      processVideoEvents({ ...meta, events }),
      processVideoEvents({ ...meta, events }),
    ])
    const accepted = a.accepted + b.accepted
    // Between them the twelve events are recorded exactly once. Which of
    // the two won the race is not interesting; that only one did is.
    assert.equal(accepted, 12)
    const rows = await VideoAnalyticsEvent.countDocuments({ userId: user._id, sessionId })
    assert.equal(rows, 12)
  })

  test('an event with no client id still works, so old clients keep working', async () => {
    const sessionId = `session-legacy-${stamp}`
    const legacy = [
      { eventType: 'play', timestamp: new Date('2026-09-10T09:00:00.000Z').toISOString(), position: 0 },
      { eventType: 'progress', timestamp: new Date('2026-09-10T09:00:30.000Z').toISOString(), position: 400, duration: 30 },
    ]
    const meta = { userId: user._id.toString(), sessionId, videoId: video._id.toString(), device: 'desktop', browser: 'firefox' }

    const result = await processVideoEvents({ ...meta, events: legacy })
    assert.equal(result.accepted, 2)
    // The partial index is what lets several of these coexist: a plain
    // unique index would make the second event with no id collide with the
    // first.
    const again = await processVideoEvents({ ...meta, events: legacy })
    assert.equal(again.accepted, 2)
    const rows = await VideoAnalyticsEvent.countDocuments({ userId: user._id, sessionId })
    assert.equal(rows, 4, 'without a client id there is nothing to deduplicate by')
  })

  test('the repository reports which events were new', async () => {
    const shared = crypto.randomUUID()
    const rows = [
      { userId: user._id, sessionId: 'repo-test', videoId: video._id, eventType: 'play', timestamp: new Date(), clientEventId: shared },
      { userId: user._id, sessionId: 'repo-test', videoId: video._id, eventType: 'pause', timestamp: new Date(), clientEventId: crypto.randomUUID() },
    ]
    const firstWrite = await videoAnalyticsEventRepository.insertMany(rows)
    assert.equal(firstWrite.inserted.length, 2)
    assert.equal(firstWrite.duplicates.length, 0)

    // One repeat and one new event in the same batch: `ordered: false` is
    // what lets the new one through instead of the write stopping at the
    // duplicate.
    const mixed = [
      rows[0],
      { userId: user._id, sessionId: 'repo-test', videoId: video._id, eventType: 'ended', timestamp: new Date(), clientEventId: crypto.randomUUID() },
    ]
    const secondWrite = await videoAnalyticsEventRepository.insertMany(mixed)
    assert.equal(secondWrite.duplicates.length, 1)
    assert.equal(secondWrite.inserted.length, 1)
    assert.equal(secondWrite.inserted[0].eventType, 'ended')

    await VideoAnalyticsEvent.deleteMany({ sessionId: 'repo-test' })
  })

  test('one person’s client id cannot suppress another person’s event', async () => {
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    const other = await User.create({
      firstName: 'Boshqa',
      lastName: 'Odam',
      fullName: 'Odam Boshqa',
      jshshir: `12${stamp}002`,
      passwordHash: 'x',
      roleId: role._id,
    })
    const shared = crypto.randomUUID()
    const event = { eventType: 'play', timestamp: new Date().toISOString(), position: 0, clientEventId: shared }

    await processVideoEvents({
      userId: user._id.toString(),
      sessionId: `scope-a-${stamp}`,
      videoId: video._id.toString(),
      events: [event],
      device: 'mobile',
      browser: 'chrome',
    })
    const result = await processVideoEvents({
      userId: other._id.toString(),
      sessionId: `scope-b-${stamp}`,
      videoId: video._id.toString(),
      events: [event],
      device: 'mobile',
      browser: 'chrome',
    })
    // The index is scoped by user: ids are generated on devices, and two
    // devices could produce the same string.
    assert.equal(result.accepted, 1)
    await VideoAnalyticsEvent.deleteMany({ userId: other._id })
    await VideoProgress.deleteMany({ userId: other._id })
    await VideoSession.deleteMany({ userId: other._id })
    await User.deleteOne({ _id: other._id })
  })
})
