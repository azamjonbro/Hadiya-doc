// AT-31 — the waiting list.
//
//   GIVEN capacity 10 and ten people registered
//   WHEN  an eleventh registers
//   THEN  200 with status WAITLIST and waitlistPosition 1; and when one of
//         the ten cancels, the eleventh becomes REGISTERED automatically
//         and gets EVENT_WAITLIST_PROMOTED
//
// The whole feature is one question: what happens to the eleventh person
// when the room holds ten. Refusing them loses the fact that they wanted to
// come; letting them in overfills the room. So they queue — and the queue
// has to move on its own, because a waiting list nobody promotes from is a
// list of people who were told "maybe" and never heard again.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Event } from '../src/models/event.model.js'
import { EventRegistration } from '../src/models/eventRegistration.model.js'
import { Notification } from '../src/models/notification.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { eventRegistrationService } from '../src/services/events/eventRegistration.service.js'
import { eventService } from '../src/services/events/event.service.js'
import { M6_DEFAULTS, planWrites, backfillRegistrations } from '../src/scripts/migrateEvents.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const CAPACITY = 10

let organiser
let people = []
let event
let legacyEvent
const userIds = []

const actorFor = (user) => ({ id: user._id.toString(), permissions: [] })

async function makeUser(index) {
  const user = await User.create({
    firstName: `Ishtirokchi${index}`,
    lastName: 'Event',
    fullName: `Ishtirokchi${index} Event`,
    jshshir: `61${index}${stamp}`,
    passwordHash: await hashPassword('EventTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
  })
  userIds.push(user._id)
  return user
}

describe('AT-31 · the event waiting list', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    organiser = await makeUser(0)
    for (let index = 1; index <= 12; index += 1) people.push(await makeUser(index))

    event = await Event.create({
      title: `Safety training ${stamp}`,
      type: 'TRAINING',
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
      mode: 'ONLINE',
      meeting: { provider: 'ZOOM', url: 'https://example.invalid/j/1', passcode: 'secret-passcode' },
      capacity: CAPACITY,
      requiresRegistration: true,
      createdBy: organiser._id,
    })
  })

  after(async () => {
    await Promise.all([
      EventRegistration.deleteMany({ eventId: { $in: [event._id, legacyEvent].filter(Boolean) } }),
      Notification.deleteMany({ userId: { $in: userIds } }),
    ])
    await Event.deleteMany({ _id: { $in: [event._id, legacyEvent].filter(Boolean) } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('filling the room', () => {
    test('the first ten get seats', async () => {
      for (let index = 0; index < CAPACITY; index += 1) {
        const result = await eventRegistrationService.register(actorFor(people[index]), event._id)
        assert.equal(result.status, 'REGISTERED', `person ${index + 1} should have a seat`)
      }
      const stored = await Event.findById(event._id).lean()
      assert.equal(stored.registeredCount, CAPACITY)
    })

    test('the eleventh joins the queue rather than being refused', async () => {
      const result = await eventRegistrationService.register(actorFor(people[10]), event._id)
      assert.equal(result.status, 'WAITLIST')
      assert.equal(result.waitlistPosition, 1)
    })

    test('the twelfth queues behind them', async () => {
      const result = await eventRegistrationService.register(actorFor(people[11]), event._id)
      assert.equal(result.status, 'WAITLIST')
      assert.equal(result.waitlistPosition, 2)
    })

    test('registering twice does not take a second seat', async () => {
      const before = (await Event.findById(event._id).lean()).registeredCount
      const result = await eventRegistrationService.register(actorFor(people[0]), event._id)
      assert.equal(result.status, 'REGISTERED')
      assert.equal((await Event.findById(event._id).lean()).registeredCount, before)
    })
  })

  describe('the queue moving', () => {
    test('a cancellation promotes the person at the front', async () => {
      const result = await eventRegistrationService.cancel(actorFor(people[0]), event._id)
      assert.equal(result.cancelled, true)
      assert.equal(result.promoted, String(people[10]._id), 'the first in the queue takes the freed seat')

      const promoted = await EventRegistration.findOne({ eventId: event._id, userId: people[10]._id }).lean()
      assert.equal(promoted.status, 'REGISTERED')
      assert.equal(promoted.waitlistPosition, 0)

      // The room is full again, not eleven-strong.
      assert.equal((await Event.findById(event._id).lean()).registeredCount, CAPACITY)
    })

    test('the promoted person is told', async () => {
      const notice = await Notification.findOne({
        userId: people[10]._id,
        type: 'EVENT_WAITLIST_PROMOTED',
      }).lean()
      assert.ok(notice, 'a waiting list nobody hears from is a list of people told "maybe"')
    })

    test('the queue renumbers, so "you are next" stays true', async () => {
      const remaining = await EventRegistration.findOne({ eventId: event._id, userId: people[11]._id }).lean()
      assert.equal(remaining.status, 'WAITLIST')
      assert.equal(remaining.waitlistPosition, 1)
    })

    test('cancelling a waiting-list place promotes nobody', async () => {
      // No seat was freed — promoting would put eleven people in the room.
      const result = await eventRegistrationService.cancel(actorFor(people[11]), event._id)
      assert.equal(result.cancelled, true)
      assert.equal(result.promoted, null)
      assert.equal((await Event.findById(event._id).lean()).registeredCount, CAPACITY)
    })

    test('somebody who cancelled can register again', async () => {
      // The row already exists as CANCELLED, and the unique index would
      // refuse a second one — so registering has to be an upsert.
      const result = await eventRegistrationService.register(actorFor(people[0]), event._id)
      assert.equal(result.status, 'WAITLIST')
      assert.equal(result.waitlistPosition, 1)
    })
  })

  describe('what the joining details are visible to', () => {
    test('somebody with a seat sees the passcode', async () => {
      const dto = await eventService.getById(event._id.toString(), actorFor(people[1]))
      assert.equal(dto.meeting.passcode, 'secret-passcode')
      assert.equal(dto.myRegistration.status, 'REGISTERED')
    })

    test('somebody in the queue does not', async () => {
      // A passcode in the catalog response is a passcode in every browser
      // that loaded the page, including the people who were not let in.
      const dto = await eventService.getById(event._id.toString(), actorFor(people[0]))
      assert.equal(dto.meeting.passcode, undefined)
      assert.equal(dto.myRegistration.status, 'WAITLIST')
    })

    test('the organiser sees it whether or not they registered', async () => {
      const dto = await eventService.getById(event._id.toString(), actorFor(organiser))
      assert.equal(dto.meeting.passcode, 'secret-passcode')
    })
  })

  describe('attendance', () => {
    test('marking it records who said so, and frees no seats', async () => {
      const before = (await Event.findById(event._id).lean()).registeredCount
      const result = await eventRegistrationService.markAttendance(actorFor(organiser), event._id, [
        { userId: people[1]._id.toString(), attended: true },
        { userId: people[2]._id.toString(), attended: false },
      ])
      assert.equal(result.marked, 2)

      const attended = await EventRegistration.findOne({ eventId: event._id, userId: people[1]._id }).lean()
      assert.equal(attended.status, 'ATTENDED')
      assert.equal(String(attended.markedBy), String(organiser._id))

      const noShow = await EventRegistration.findOne({ eventId: event._id, userId: people[2]._id }).lean()
      assert.equal(noShow.status, 'NO_SHOW')

      // The seat count does not move. Marking somebody absent does not
      // return their seat to the pool — the event has happened, and
      // promoting the queue into a session that is over would be absurd.
      assert.equal((await Event.findById(event._id).lean()).registeredCount, before)
    })
  })

  describe('an event that takes no registrations', () => {
    test('is refused rather than silently seating everybody', async () => {
      const announcement = await Event.create({
        title: `Announcement ${stamp}`,
        type: 'ANNOUNCEMENT',
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 90000000),
        requiresRegistration: false,
        createdBy: organiser._id,
      })
      await assert.rejects(
        () => eventRegistrationService.register(actorFor(people[3]), announcement._id),
        (error) => error.code === 'NO_REGISTRATION'
      )
      await Event.deleteOne({ _id: announcement._id })
    })
  })

  describe('migration M6', () => {
    test('only writes fields that are missing', () => {
      for (const write of planWrites()) {
        const [field] = Object.keys(write.filter)
        assert.deepEqual(write.filter[field], { $exists: false })
      }
      // False, not true: these events predate registration entirely, and
      // switching it on would put a "register" button on things that have
      // already happened.
      assert.equal(M6_DEFAULTS.requiresRegistration, false)
      assert.equal(M6_DEFAULTS.status, 'PUBLISHED')
    })

    test('turns a pre-6.1 participants array into registrations', async () => {
      // That array was the only record of who was coming, so leaving it
      // unconverted would show nobody attending every historical event.
      const inserted = await Event.collection.insertOne({
        title: `Legacy event ${stamp}`,
        description: '',
        type: 'MEETING',
        startAt: new Date('2026-01-10'),
        endAt: new Date('2026-01-10'),
        location: '',
        participants: [people[4]._id, people[5]._id],
        createdBy: organiser._id,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      })
      legacyEvent = inserted.insertedId

      const result = await backfillRegistrations({ write: true })
      assert.ok(result.created >= 2)

      const rows = await EventRegistration.find({ eventId: legacyEvent }).lean()
      assert.equal(rows.length, 2)
      // REGISTERED regardless of capacity: nobody was ever queued back
      // then, and inventing a waiting list retroactively would tell people
      // they lost a seat they in fact took.
      assert.ok(rows.every((row) => row.status === 'REGISTERED'))
      assert.equal((await Event.findById(legacyEvent).lean()).registeredCount, 2)
    })

    test('running it again creates nothing', async () => {
      const before = await EventRegistration.countDocuments({ eventId: legacyEvent })
      await backfillRegistrations({ write: true })
      assert.equal(await EventRegistration.countDocuments({ eventId: legacyEvent }), before)
    })
  })
})
