import { Event } from '../../models/event.model.js'
import { EventRegistration } from '../../models/eventRegistration.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { Course } from '../../models/course.model.js'
import { Task } from '../../models/task.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { LearningPath } from '../../models/learningPath.model.js'
import { env } from '../../config/env.js'

/**
 * One calendar, from four collections.
 *
 * An employee's obligations are scattered: a training session lives in
 * `events`, a course due date on their assignment, a task on the task, a
 * programme deadline on the enrolment. Four screens is four chances to miss
 * one, and none of them answers "what do I have to do this week".
 *
 * Everything is read-only here. A calendar entry is a *view* of the thing
 * it comes from — moving a course deadline is an act on the assignment, not
 * on the calendar — so this service never writes.
 */

const KINDS = {
  EVENT: 'EVENT',
  COURSE_DEADLINE: 'COURSE_DEADLINE',
  TASK_DEADLINE: 'TASK_DEADLINE',
  PATH_DEADLINE: 'PATH_DEADLINE',
}

function windowFrom({ from, to } = {}) {
  const start = from ? new Date(from) : new Date()
  // A month is what a calendar page shows. Unbounded would mean loading
  // every deadline an employee has ever been given.
  const end = to ? new Date(to) : new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000)
  return { start, end }
}

export const calendarService = {
  async build(actor, query = {}) {
    const { start, end } = windowFrom(query)
    const inWindow = { $gte: start, $lte: end }
    const entries = []

    // --- Events the person is actually going to ---
    //
    // Registrations first, then the invitation list: an event somebody
    // registered for is theirs whether or not they were invited, and an
    // invitation they queued for is still on their calendar.
    const registrations = await EventRegistration.find(
      { userId: actor.id, status: { $in: ['REGISTERED', 'WAITLIST', 'ATTENDED'] } },
      { eventId: 1, status: 1 }
    ).lean()
    const registrationByEvent = new Map(registrations.map((row) => [String(row.eventId), row.status]))

    const events = await Event.find({
      startAt: inWindow,
      status: { $ne: 'CANCELLED' },
      $or: [
        { _id: { $in: registrations.map((row) => row.eventId) } },
        { participants: actor.id },
        // Open events with no invitation list and no registration are the
        // company-wide ones; leaving them out would hide the all-hands.
        { participants: { $size: 0 }, requiresRegistration: false },
      ],
    }).lean()

    for (const event of events) {
      entries.push({
        id: `event:${event._id}`,
        kind: KINDS.EVENT,
        title: event.title,
        description: event.description ?? '',
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: false,
        location: event.location ?? '',
        url: `${env.APP_URL}/events/${event._id}`,
        refId: String(event._id),
        // A queued place is on the calendar and marked as such: turning up
        // to something you are only queued for is the mistake this
        // prevents.
        status: registrationByEvent.get(String(event._id)) ?? 'INVITED',
      })
    }

    // --- Course deadlines ---
    const assignments = await CourseAssignment.find({
      userId: actor.id,
      status: 'ACTIVE',
      deadline: inWindow,
    }).lean()
    const courses = await Course.find(
      { _id: { $in: assignments.map((row) => row.courseId) } },
      { title: 1 }
    ).lean()
    const courseById = new Map(courses.map((course) => [String(course._id), course]))

    for (const assignment of assignments) {
      const course = courseById.get(String(assignment.courseId))
      if (!course) continue
      entries.push({
        id: `course:${assignment._id}`,
        kind: KINDS.COURSE_DEADLINE,
        title: course.title,
        description: '',
        startAt: assignment.deadline,
        endAt: assignment.deadline,
        // A deadline is a day, not a moment: showing "23:59" implies a
        // precision nobody meant.
        allDay: true,
        location: '',
        url: `${env.APP_URL}/courses/${assignment.courseId}`,
        refId: String(assignment.courseId),
        status: assignment.mandatory ? 'MANDATORY' : 'OPTIONAL',
      })
    }

    // --- Tasks ---
    const tasks = await Task.find({
      assignedTo: actor.id,
      status: { $in: ['TODO', 'IN_PROGRESS'] },
      deadline: inWindow,
    }).lean()

    for (const task of tasks) {
      entries.push({
        id: `task:${task._id}`,
        kind: KINDS.TASK_DEADLINE,
        title: task.title,
        description: task.description ?? '',
        startAt: task.deadline,
        endAt: task.deadline,
        allDay: true,
        location: '',
        url: `${env.APP_URL}/tasks`,
        refId: String(task._id),
        status: task.priority,
      })
    }

    // --- Learning path deadlines ---
    const enrollments = await PathEnrollment.find({
      userId: actor.id,
      status: 'ACTIVE',
      deadline: inWindow,
    }).lean()
    const paths = await LearningPath.find(
      { _id: { $in: enrollments.map((row) => row.pathId) } },
      { title: 1 }
    ).lean()
    const pathById = new Map(paths.map((path) => [String(path._id), path]))

    for (const enrollment of enrollments) {
      const path = pathById.get(String(enrollment.pathId))
      if (!path) continue
      entries.push({
        id: `path:${enrollment._id}`,
        kind: KINDS.PATH_DEADLINE,
        title: path.title,
        description: '',
        startAt: enrollment.deadline,
        endAt: enrollment.deadline,
        allDay: true,
        location: '',
        url: `${env.APP_URL}/paths/${enrollment.pathId}`,
        refId: String(enrollment.pathId),
        status: enrollment.mandatory ? 'MANDATORY' : 'OPTIONAL',
      })
    }

    entries.sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    return { from: start, to: end, items: entries }
  },
}

// --- iCalendar ---

/** Folds a line at 75 octets, as RFC 5545 requires. */
function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line
  const parts = []
  let current = ''
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > 74) {
      parts.push(current)
      // A continuation line begins with one space, which the parser strips.
      current = ' '
    }
    current += char
  }
  parts.push(current)
  return parts.join('\r\n')
}

/**
 * Escapes a value for iCalendar.
 *
 * Commas and semicolons are field separators there, so an unescaped course
 * title containing one silently truncates the entry — the sort of thing
 * that shows up as "half the events are missing their description".
 */
function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function stamp(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function stampDate(date) {
  return new Date(date).toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * The whole calendar as an .ics file.
 *
 * Deadlines are all-day entries (`VALUE=DATE`) rather than instants: a
 * course due "on Friday" pinned to 23:59 shows up in Outlook as a late
 * evening appointment, which is not what anybody meant.
 */
export function toIcs(entries, { name = 'Qo‘llanma' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Qollanma LMS//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
  ]

  for (const entry of entries) {
    lines.push('BEGIN:VEVENT')
    // Stable across regenerations, so a subscribing client updates the
    // entry it already has instead of adding a second copy of it.
    lines.push(`UID:${entry.id}@qollanma`)
    lines.push(`DTSTAMP:${stamp(new Date())}`)
    if (entry.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${stampDate(entry.startAt)}`)
    } else {
      lines.push(`DTSTART:${stamp(entry.startAt)}`)
      lines.push(`DTEND:${stamp(entry.endAt)}`)
    }
    lines.push(fold(`SUMMARY:${escapeText(entry.title)}`))
    if (entry.description) lines.push(fold(`DESCRIPTION:${escapeText(entry.description)}`))
    if (entry.location) lines.push(fold(`LOCATION:${escapeText(entry.location)}`))
    if (entry.url) lines.push(fold(`URL:${escapeText(entry.url)}`))
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  // CRLF, not LF: some parsers reject the file outright without it.
  return `${lines.join('\r\n')}\r\n`
}
