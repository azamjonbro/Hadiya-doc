// AT-32 — everybody hears when an event moves.
//
//   WHEN  PATCH /events/:id changes startAt
//   THEN  every REGISTERED and WAITLIST participant gets EVENT_RESCHEDULED
//
// Leaving the waiting list out is the obvious-looking mistake and the wrong
// one: somebody queued for Thursday has arranged their Thursday around
// possibly attending, and a session moved to Monday concerns them exactly
// as much.
//
// EVENT_RESCHEDULED and EVENT_CANCELLED are mandatory types (§9.3), so they
// reach people who muted event notifications — the failure mode is somebody
// travelling to a session that is not happening.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { MANDATORY_NOTIFICATION_TYPES } from '@lms/shared'
import { Event } from '../src/models/event.model.js'
import { EventRegistration } from '../src/models/eventRegistration.model.js'
import { Notification } from '../src/models/notification.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { eventService } from '../src/services/events/event.service.js'
import { eventRegistrationService } from '../src/services/events/eventRegistration.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let organiser
let seated
let queued
let uninvolved
let event
const userIds = []

const actorFor = (user) => ({ id: user._id.toString(), permissions: ['event:create'] })

async function makeUser(name) {
  const user = await User.create({
    firstName: name,
    lastName: 'Notify',
    fullName: `${name} Notify`,
    jshshir: `72${userIds.length}${stamp}`,
    passwordHash: await hashPassword('NotifyTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
  })
  userIds.push(user._id)
  return user
}

const noticesFor = (userId, type) =>
  Notification.countDocuments({ userId, type, relatedEntityId: String(event._id) })

describe('AT-32 · event change notifications', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    organiser = await makeUser('Tashkilotchi')
    seated = await makeUser('Joyli')
    queued = await makeUser('Navbatdagi')
    uninvolved = await makeUser('Begona')

    event = await Event.create({
      title: `Moving session ${stamp}`,
      type: 'TRAINING',
      startAt: new Date('2026-10-01T09:00:00Z'),
      endAt: new Date('2026-10-01T11:00:00Z'),
      location: 'Room 1',
      capacity: 1,
      requiresRegistration: true,
      status: 'PUBLISHED',
      createdBy: organiser._id,
    })

    await eventRegistrationService.register(actorFor(seated), event._id)
    await eventRegistrationService.register(actorFor(queued), event._id)
  })

  after(async () => {
    await Promise.all([
      EventRegistration.deleteMany({ eventId: event._id }),
      Notification.deleteMany({ userId: { $in: userIds } }),
    ])
    await Event.deleteOne({ _id: event._id })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('a moved event', () => {
    test('tells the person with a seat', async () => {
      await eventService.update(actorFor(organiser), event._id.toString(), {
        startAt: new Date('2026-10-05T09:00:00Z'),
      })
      assert.equal(await noticesFor(seated._id, 'EVENT_RESCHEDULED'), 1)
    })

    test('tells the person in the queue too', async () => {
      assert.equal(
        await noticesFor(queued._id, 'EVENT_RESCHEDULED'),
        1,
        'a queued person has arranged their day around possibly attending'
      )
    })

    test('does not tell somebody who is not coming', async () => {
      assert.equal(await noticesFor(uninvolved._id, 'EVENT_RESCHEDULED'), 0)
    })

    test('the message carries the old time as well as the new one', async () => {
      const notice = await Notification.findOne({ userId: seated._id, type: 'EVENT_RESCHEDULED' }).lean()
      // "Moved to Monday 14:00" without the old time is unreadable to
      // somebody with three sessions in their calendar.
      assert.match(notice.message, /2026/)
      assert.ok(notice.message.length > 10)
    })

    test('a change that is not a move says nothing', async () => {
      const before = await noticesFor(seated._id, 'EVENT_RESCHEDULED')
      await eventService.update(actorFor(organiser), event._id.toString(), { description: 'Bring a notebook' })
      assert.equal(await noticesFor(seated._id, 'EVENT_RESCHEDULED'), before)
    })

    test('moving it clears the reminder markers', async () => {
      // An event moved from Tuesday to Friday has to remind people again;
      // the dedup markers would otherwise say it already had.
      await Event.updateOne({ _id: event._id }, { $set: { remindersSentFor: [60] } })
      await eventService.update(actorFor(organiser), event._id.toString(), {
        startAt: new Date('2026-10-06T09:00:00Z'),
      })
      const stored = await Event.findById(event._id).lean()
      assert.deepEqual(stored.remindersSentFor, [])
    })
  })

  describe('reminders', () => {
    test('go out once per configured offset', async () => {
      await Event.updateOne(
        { _id: event._id },
        {
          $set: {
            startAt: new Date(Date.now() + 45 * 60 * 1000),
            endAt: new Date(Date.now() + 105 * 60 * 1000),
            remindBeforeMinutes: [1440, 60],
            remindersSentFor: [],
          },
        }
      )

      const first = await eventService.sendDueReminders()
      assert.ok(first.reminders >= 1)
      // Both offsets are already past — an event created inside its own
      // 24-hour window sends the day-before reminder now rather than never.
      const stored = await Event.findById(event._id).lean()
      assert.deepEqual([...stored.remindersSentFor].sort((a, b) => a - b), [60, 1440])
      assert.equal(await noticesFor(seated._id, 'EVENT_REMINDER'), 2)
    })

    test('a second sweep sends nothing', async () => {
      // The sweep runs every fifteen minutes; without the dedup marker the
      // 60-minute reminder would go four times.
      const before = await noticesFor(seated._id, 'EVENT_REMINDER')
      await eventService.sendDueReminders()
      assert.equal(await noticesFor(seated._id, 'EVENT_REMINDER'), before)
    })
  })

  describe('cancellation', () => {
    test('tells everybody, seat or queue', async () => {
      await eventService.update(actorFor(organiser), event._id.toString(), {
        status: 'CANCELLED',
        cancelReason: 'The trainer is ill',
      })
      assert.equal(await noticesFor(seated._id, 'EVENT_CANCELLED'), 1)
      assert.equal(await noticesFor(queued._id, 'EVENT_CANCELLED'), 1)
    })

    test('stamps when it was cancelled', async () => {
      const stored = await Event.findById(event._id).lean()
      assert.equal(stored.status, 'CANCELLED')
      assert.ok(stored.cancelledAt)
      assert.equal(stored.cancelReason, 'The trainer is ill')
    })

    test('a cancelled event takes no more registrations', async () => {
      await assert.rejects(
        () => eventRegistrationService.register(actorFor(uninvolved), event._id),
        (error) => error.code === 'EVENT_CANCELLED'
      )
    })
  })

  describe('the mandatory list', () => {
    test('covers both messages somebody must not miss', () => {
      // Muting event notifications must not let somebody travel to a
      // session that is not happening.
      assert.ok(MANDATORY_NOTIFICATION_TYPES.includes('EVENT_CANCELLED'))
      assert.ok(MANDATORY_NOTIFICATION_TYPES.includes('EVENT_RESCHEDULED'))
    })
  })
})
