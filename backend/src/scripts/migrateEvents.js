/**
 * Migration M6 — event fields, and the registrations behind them.
 *
 * Two parts.
 *
 * The first is the same `$exists: false` backfill as M3, for the same
 * reason: Mongoose defaults never touch documents already stored, so an
 * event written last year has no `status`, no `mode` and no `capacity`, and
 * a query for `{ status: 'PUBLISHED' }` would silently drop every one of
 * them from the calendar.
 *
 * The second turns each existing event's `participants` array into
 * EventRegistration rows. That array was the only record of who was coming,
 * so leaving it unconverted would mean every historical event shows nobody
 * attending. `participants` itself is kept — from 6.1 it is the invitation
 * list, which is a different fact from having a seat.
 *
 * Rows are written as REGISTERED regardless of capacity. Capacity did not
 * exist when these events were created, so nobody was ever queued, and
 * inventing a waiting list retroactively would tell people they had lost a
 * seat they in fact attended.
 *
 *   npm --prefix backend run migrate:events -- --dry-run
 *   npm --prefix backend run migrate:events
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { Event } from '../models/event.model.js'
import { EventRegistration } from '../models/eventRegistration.model.js'

const dryRun = process.argv.includes('--dry-run')

export const M6_DEFAULTS = {
  mode: 'OFFLINE',
  meeting: {},
  trainerIds: [],
  capacity: 0,
  registeredCount: 0,
  // False, not true: these events predate registration entirely, and
  // switching it on would put a "register" button on things that already
  // happened.
  requiresRegistration: false,
  remindBeforeMinutes: [],
  remindersSentFor: [],
  linkedCourseId: null,
  status: 'PUBLISHED',
  cancelledAt: null,
  cancelReason: '',
}

export function planWrites(defaults = M6_DEFAULTS) {
  return Object.entries(defaults).map(([field, value]) => ({
    field,
    filter: { [field]: { $exists: false } },
    update: { $set: { [field]: value } },
  }))
}

export async function backfillRegistrations({ write = true } = {}) {
  const events = await Event.find({ participants: { $exists: true, $ne: [] } }, { participants: 1 }).lean()
  let created = 0

  for (const event of events) {
    for (const userId of event.participants ?? []) {
      const existing = await EventRegistration.findOne({ eventId: event._id, userId }, { _id: 1 }).lean()
      if (existing) continue
      created += 1
      if (!write) continue
      await EventRegistration.create({
        eventId: event._id,
        userId,
        status: 'REGISTERED',
        // No better date exists — the array carried no timestamps.
        registeredAt: event.createdAt ?? new Date(),
      })
    }
    if (write) {
      const registered = await EventRegistration.countDocuments({ eventId: event._id, status: 'REGISTERED' })
      await Event.updateOne({ _id: event._id }, { $set: { registeredCount: registered } })
    }
  }

  return { events: events.length, created }
}

async function main() {
  await connectDatabase()

  const total = await Event.countDocuments()
  console.log(`${total} event(s) in the database`)

  let touched = 0
  for (const write of planWrites()) {
    const count = await Event.countDocuments(write.filter)
    if (!count) continue
    touched += count
    console.log(`  ${write.field}: ${count} event(s) missing it`)
    if (!dryRun) await Event.updateMany(write.filter, write.update)
  }
  if (!touched) console.log('  every event already carries the 6.1 fields')

  const registrations = await backfillRegistrations({ write: !dryRun })
  console.log(
    `\n${registrations.created} registration(s) to create from ${registrations.events} event(s) with participants`
  )

  if (dryRun) console.log('\n--dry-run: nothing written')
  else console.log('\nWritten')

  await mongoose.connection.close()
  process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('migrateEvents.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
