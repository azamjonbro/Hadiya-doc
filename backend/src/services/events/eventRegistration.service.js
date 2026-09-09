import { Event } from '../../models/event.model.js'
import { EventRegistration } from '../../models/eventRegistration.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Seats and the queue for them (AT-31).
 *
 * The whole feature is one hard question: what happens to the eleventh
 * person when the room holds ten. Refusing them loses the information that
 * they wanted to come; letting them in overfills the room. So they join a
 * queue, and the queue moves on its own when somebody drops out — because
 * a waiting list nobody promotes from is a list of people who were told
 * "maybe" and then never heard again.
 *
 * `registeredCount` on the event is a cache for the catalog, corrected from
 * the rows after every change rather than incremented, so it can drift by
 * at most one write.
 */

async function syncCount(eventId) {
  const registered = await EventRegistration.countDocuments({ eventId, status: 'REGISTERED' })
  await Event.updateOne({ _id: eventId }, { $set: { registeredCount: registered } })
  return registered
}

/** Renumbers the queue so positions are 1..n with no gaps. */
async function renumberWaitlist(eventId) {
  const waiting = await EventRegistration.find({ eventId, status: 'WAITLIST' })
    .sort({ waitlistPosition: 1, registeredAt: 1 })
    .lean()
  for (const [index, row] of waiting.entries()) {
    const position = index + 1
    if (row.waitlistPosition !== position) {
      await EventRegistration.updateOne({ _id: row._id }, { $set: { waitlistPosition: position } })
    }
  }
  return waiting.length
}

export const eventRegistrationService = {
  /**
   * Registers somebody, or puts them in the queue.
   *
   * The seat count is read and the row written without a transaction —
   * Mongo runs standalone here — so two people registering for the last
   * seat can both see nine of ten. The unique index stops the *duplicate*
   * case; the overfill case is corrected by `syncCount` and, deliberately,
   * tolerated: a room with eleven people in it is a problem somebody
   * notices, whereas losing a registration is one nobody does.
   */
  async register(actor, eventId) {
    const event = await Event.findById(eventId)
    if (!event) throw ApiError.notFound('Event not found')
    if (event.status === 'CANCELLED') throw ApiError.badRequest('This event was cancelled', 'EVENT_CANCELLED')
    if (!event.requiresRegistration) {
      throw ApiError.badRequest('This event does not take registrations', 'NO_REGISTRATION')
    }
    if (event.endAt < new Date()) throw ApiError.badRequest('This event has already happened', 'EVENT_PAST')

    const existing = await EventRegistration.findOne({ eventId, userId: actor.id })
    if (existing && existing.status !== 'CANCELLED') {
      return { status: existing.status, waitlistPosition: existing.waitlistPosition }
    }

    const registered = await EventRegistration.countDocuments({ eventId, status: 'REGISTERED' })
    const full = event.capacity > 0 && registered >= event.capacity
    const status = full ? 'WAITLIST' : 'REGISTERED'
    const waitlistPosition = full
      ? (await EventRegistration.countDocuments({ eventId, status: 'WAITLIST' })) + 1
      : 0

    // Upsert rather than create: somebody who cancelled and came back has a
    // CANCELLED row already, and the unique index would refuse a new one.
    const row = await EventRegistration.findOneAndUpdate(
      { eventId, userId: actor.id },
      { $set: { status, waitlistPosition, registeredAt: new Date(), attendedAt: null, markedBy: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    await syncCount(eventId)

    await notificationService
      .notify({
        userId: actor.id,
        type: status === 'REGISTERED' ? 'EVENT_REGISTERED' : 'EVENT_WAITLISTED',
        vars: {
          eventTitle: event.title,
          eventDate: formatNotificationDate(event.startAt),
          position: String(waitlistPosition),
        },
        relatedEntityType: 'Event',
        relatedEntityId: String(eventId),
      })
      .catch((error) => logger.warn('Event registration notice failed', { error: error.message }))

    return { status: row.status, waitlistPosition: row.waitlistPosition }
  },

  /**
   * Cancels a registration, and moves the queue up.
   *
   * The promotion happens here rather than on a schedule because the seat
   * is free now: a queue that only moves overnight is one where the person
   * who freed the seat at 09:00 leaves it empty all day.
   */
  async cancel(actor, eventId, { userId = null } = {}) {
    const targetId = userId ?? actor.id
    const row = await EventRegistration.findOne({ eventId, userId: targetId })
    if (!row || row.status === 'CANCELLED') return { cancelled: false }

    const freedSeat = row.status === 'REGISTERED'
    row.status = 'CANCELLED'
    row.waitlistPosition = 0
    await row.save()

    await syncCount(eventId)
    await renumberWaitlist(eventId)

    const promoted = freedSeat ? await this.promoteFromWaitlist(eventId) : null
    return { cancelled: true, promoted: promoted ? String(promoted.userId) : null }
  },

  /** Gives the freed seat to whoever is first in the queue. */
  async promoteFromWaitlist(eventId) {
    const event = await Event.findById(eventId).lean()
    if (!event || event.status === 'CANCELLED') return null

    const registered = await EventRegistration.countDocuments({ eventId, status: 'REGISTERED' })
    if (event.capacity > 0 && registered >= event.capacity) return null

    const next = await EventRegistration.findOne({ eventId, status: 'WAITLIST' })
      .sort({ waitlistPosition: 1, registeredAt: 1 })
      .exec()
    if (!next) return null

    next.status = 'REGISTERED'
    next.waitlistPosition = 0
    await next.save()

    await syncCount(eventId)
    await renumberWaitlist(eventId)

    await notificationService
      .notify({
        userId: next.userId,
        type: 'EVENT_WAITLIST_PROMOTED',
        vars: { eventTitle: event.title, eventDate: formatNotificationDate(event.startAt) },
        relatedEntityType: 'Event',
        relatedEntityId: String(eventId),
        severity: 'WARNING',
      })
      .catch((error) => logger.warn('Waitlist promotion notice failed', { error: error.message }))

    await auditLogRepository.record({
      actor: next.userId,
      action: 'EVENT_WAITLIST_PROMOTED',
      entity: 'Event',
      entityId: String(eventId),
      metadata: { userId: String(next.userId) },
    })

    return next
  },

  /** Attendance, marked by a trainer after the fact. */
  async markAttendance(actor, eventId, entries) {
    const event = await Event.findById(eventId).lean()
    if (!event) throw ApiError.notFound('Event not found')

    let marked = 0
    for (const entry of entries) {
      const status = entry.attended ? 'ATTENDED' : 'NO_SHOW'
      const result = await EventRegistration.updateOne(
        { eventId, userId: entry.userId },
        {
          $set: {
            status,
            attendedAt: entry.attended ? new Date() : null,
            // Attendance is somebody's assertion, so it records whose.
            markedBy: actor.id,
          },
        }
      )
      marked += result.modifiedCount ?? 0
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'EVENT_ATTENDANCE_MARKED',
      entity: 'Event',
      entityId: String(eventId),
      metadata: { marked, total: entries.length },
    })

    // `registeredCount` is deliberately not resynced. It means "seats
    // taken", and marking somebody absent does not return their seat: the
    // event has happened, and promoting the queue into a session that is
    // over would be absurd.
    return { marked }
  },

  /** The registration list, for the trainer's attendance sheet. */
  async list(eventId) {
    const rows = await EventRegistration.find({ eventId, status: { $ne: 'CANCELLED' } })
      .populate('userId', 'fullName department position')
      .sort({ status: 1, waitlistPosition: 1, registeredAt: 1 })
      .lean()

    return {
      items: rows.map((row) => ({
        userId: String(row.userId?._id ?? row.userId),
        fullName: row.userId?.fullName ?? '',
        department: row.userId?.department ?? '',
        status: row.status,
        waitlistPosition: row.waitlistPosition,
        registeredAt: row.registeredAt,
        attendedAt: row.attendedAt,
      })),
    }
  },
}
