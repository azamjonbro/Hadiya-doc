// 6.4 — one calendar from four collections.
//
// An employee's obligations are scattered: a session in `events`, a course
// due date on the assignment, a task on the task, a programme deadline on
// the enrolment. Four screens is four chances to miss one.
//
// The parts worth pinning down are what belongs on somebody's calendar (a
// queued place does; somebody else's event does not) and the .ics escaping,
// because an unescaped comma silently truncates an entry rather than
// failing loudly.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Event } from '../src/models/event.model.js'
import { EventRegistration } from '../src/models/eventRegistration.model.js'
import { Course } from '../src/models/course.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { Task } from '../src/models/task.model.js'
import { LearningPath } from '../src/models/learningPath.model.js'
import { PathEnrollment } from '../src/models/pathEnrollment.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { calendarService, toIcs } from '../src/services/calendar/calendar.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

let me
let colleague
let course
let path
let myEvent
let queuedEvent
let othersEvent
let openEvent
const userIds = []

const actorFor = (user) => ({ id: user._id.toString(), permissions: [] })

async function makeUser(name) {
  const user = await User.create({
    firstName: name,
    lastName: 'Cal',
    fullName: `${name} Cal`,
    jshshir: `83${userIds.length}${stamp}`,
    passwordHash: await hashPassword('CalTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
  })
  userIds.push(user._id)
  return user
}

describe('the unified calendar (6.4)', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    me = await makeUser('Men')
    colleague = await makeUser('Hamkasb')

    course = await Course.create({
      title: `Calendar course ${stamp}`,
      slug: `calendar-course-${stamp}`,
      status: 'PUBLISHED',
      createdBy: me._id,
    })
    await CourseAssignment.create({
      userId: me._id,
      courseId: course._id,
      assignedBy: me._id,
      mandatory: true,
      deadline: inDays(3),
      status: 'ACTIVE',
    })

    await Task.create({
      title: `Calendar task ${stamp}`,
      assignedTo: me._id,
      assignedBy: colleague._id,
      deadline: inDays(2),
      status: 'TODO',
      priority: 'HIGH',
    })

    path = await LearningPath.create({
      title: `Calendar path ${stamp}`,
      slug: `calendar-path-${stamp}`,
      status: 'PUBLISHED',
      createdBy: me._id,
    })
    await PathEnrollment.create({
      userId: me._id,
      pathId: path._id,
      status: 'ACTIVE',
      mandatory: true,
      deadline: inDays(10),
    })

    myEvent = await Event.create({
      title: `Registered session ${stamp}`,
      type: 'TRAINING',
      startAt: inDays(1),
      endAt: inDays(1),
      location: 'Room 2',
      requiresRegistration: true,
      capacity: 5,
      createdBy: colleague._id,
    })
    await EventRegistration.create({ eventId: myEvent._id, userId: me._id, status: 'REGISTERED' })

    queuedEvent = await Event.create({
      title: `Queued session ${stamp}`,
      type: 'SEMINAR',
      startAt: inDays(4),
      endAt: inDays(4),
      requiresRegistration: true,
      capacity: 1,
      createdBy: colleague._id,
    })
    await EventRegistration.create({
      eventId: queuedEvent._id,
      userId: me._id,
      status: 'WAITLIST',
      waitlistPosition: 1,
    })

    othersEvent = await Event.create({
      title: `Someone else's session ${stamp}`,
      type: 'MEETING',
      startAt: inDays(5),
      endAt: inDays(5),
      participants: [colleague._id],
      createdBy: colleague._id,
    })

    openEvent = await Event.create({
      title: `All hands ${stamp}`,
      type: 'ANNOUNCEMENT',
      startAt: inDays(6),
      endAt: inDays(6),
      participants: [],
      requiresRegistration: false,
      createdBy: colleague._id,
    })
  })

  after(async () => {
    const eventIds = [myEvent._id, queuedEvent._id, othersEvent._id, openEvent._id]
    await Promise.all([
      EventRegistration.deleteMany({ eventId: { $in: eventIds } }),
      Event.deleteMany({ _id: { $in: eventIds } }),
      CourseAssignment.deleteMany({ courseId: course._id }),
      Task.deleteMany({ assignedTo: { $in: userIds } }),
      PathEnrollment.deleteMany({ pathId: path._id }),
    ])
    await Promise.all([Course.deleteOne({ _id: course._id }), LearningPath.deleteOne({ _id: path._id })])
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('what lands on it', () => {
    test('all four kinds, in time order', async () => {
      const { items } = await calendarService.build(actorFor(me), { from: new Date(), to: inDays(30) })
      const mine = items.filter((entry) => entry.title.includes(stamp))
      assert.deepEqual(mine.map((entry) => entry.kind), [
        'EVENT', // day 1, registered
        'TASK_DEADLINE', // day 2
        'COURSE_DEADLINE', // day 3
        'EVENT', // day 4, queued
        'EVENT', // day 6, all-hands
        'PATH_DEADLINE', // day 10
      ])
    })

    test('a queued place is there, and says so', async () => {
      // Turning up to something you are only queued for is the mistake this
      // prevents — so it is on the calendar, marked.
      const { items } = await calendarService.build(actorFor(me), {})
      const queued = items.find((entry) => entry.refId === String(queuedEvent._id))
      assert.ok(queued)
      assert.equal(queued.status, 'WAITLIST')
    })

    test('somebody else’s event is not', async () => {
      const { items } = await calendarService.build(actorFor(me), {})
      assert.equal(items.find((entry) => entry.refId === String(othersEvent._id)), undefined)
    })

    test('a company-wide event is', async () => {
      // No invitation list and no registration means everybody — leaving it
      // out would hide the all-hands.
      const { items } = await calendarService.build(actorFor(me), {})
      assert.ok(items.find((entry) => entry.refId === String(openEvent._id)))
    })

    test('deadlines are all-day, sessions are not', async () => {
      const { items } = await calendarService.build(actorFor(me), {})
      const deadline = items.find((entry) => entry.kind === 'COURSE_DEADLINE')
      const session = items.find((entry) => entry.refId === String(myEvent._id))
      // A course due "on Friday" pinned to 23:59 shows up as a late evening
      // appointment, which is not what anybody meant.
      assert.equal(deadline.allDay, true)
      assert.equal(session.allDay, false)
    })

    test('a finished task drops off', async () => {
      await Task.updateMany({ assignedTo: me._id }, { $set: { status: 'COMPLETED' } })
      const { items } = await calendarService.build(actorFor(me), {})
      assert.equal(items.find((entry) => entry.kind === 'TASK_DEADLINE'), undefined)
      await Task.updateMany({ assignedTo: me._id }, { $set: { status: 'TODO' } })
    })

    test('the window is a month by default, not everything ever', async () => {
      const { from, to } = await calendarService.build(actorFor(me), {})
      const days = (to - from) / (24 * 60 * 60 * 1000)
      assert.ok(days > 30 && days < 32, `expected about a month, got ${days} days`)
    })
  })

  describe('the .ics file', () => {
    test('escapes the separators rather than truncating an entry', () => {
      // Commas and semicolons are field separators in iCalendar: unescaped,
      // a title containing one silently loses everything after it.
      const ics = toIcs([
        {
          id: 'event:x',
          title: 'Safety, part 2; basics',
          description: 'Line one\nline two',
          startAt: new Date('2026-10-01T09:00:00Z'),
          endAt: new Date('2026-10-01T11:00:00Z'),
          allDay: false,
          location: 'Room 1, floor 2',
        },
      ])
      // Both separators escaped, each with a single backslash — RFC 5545
      // requires the semicolon too, not only the comma.
      assert.match(ics, /SUMMARY:Safety\\, part 2\\; basics/)
      assert.match(ics, /DESCRIPTION:Line one\\nline two/)
      assert.match(ics, /LOCATION:Room 1\\, floor 2/)
    })

    test('all-day entries use a date, not an instant', () => {
      const ics = toIcs([
        { id: 'course:x', title: 'Due', startAt: new Date('2026-10-05T00:00:00Z'), endAt: new Date('2026-10-05T00:00:00Z'), allDay: true },
      ])
      assert.match(ics, /DTSTART;VALUE=DATE:20261005/)
      assert.ok(!ics.includes('DTEND'), 'an all-day entry needs no end instant')
    })

    test('lines are folded at 75 octets', () => {
      const ics = toIcs([
        { id: 'x', title: 'A'.repeat(200), startAt: new Date(), endAt: new Date(), allDay: false },
      ])
      const tooLong = ics.split('\r\n').filter((line) => Buffer.byteLength(line, 'utf8') > 75)
      assert.deepEqual(tooLong, [])
    })

    test('uses CRLF, which some parsers insist on', () => {
      const ics = toIcs([])
      assert.ok(ics.includes('\r\n'))
      assert.ok(!/[^\r]\n/.test(ics), 'every newline has to be preceded by a carriage return')
    })

    test('the uid is stable, so a re-import updates rather than duplicates', () => {
      const entry = { id: 'event:abc', title: 'X', startAt: new Date(), endAt: new Date(), allDay: false }
      assert.match(toIcs([entry]), /UID:event:abc@qollanma/)
      assert.match(toIcs([entry]), /UID:event:abc@qollanma/)
    })
  })
})
