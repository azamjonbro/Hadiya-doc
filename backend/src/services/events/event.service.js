import { eventRepository } from '../../repositories/event.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { Event } from '../../models/event.model.js'
import { EventRegistration } from '../../models/eventRegistration.model.js'
import { eventNotifyService } from './eventNotify.service.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

function toPublicEvent(event) {
  return {
    id: event._id.toString(),
    title: event.title,
    description: event.description,
    type: event.type,
    startAt: event.startAt,
    endAt: event.endAt,
    location: event.location,
    // The invitation list, which from 6.1 is distinct from the
    // registration list — being invited and holding a seat are different
    // facts, and conflating them makes a capacity limit unenforceable.
    participants: event.participants.map((p) => p.toString()),

    // Defaulted rather than left undefined: events stored before 6.1 have
    // none of these fields, and a card reading "undefined seats" is worse
    // than one that says what those events actually are.
    mode: event.mode ?? 'OFFLINE',
    meeting: {
      provider: event.meeting?.provider ?? '',
      url: event.meeting?.url ?? '',
      meetingId: event.meeting?.meetingId ?? '',
      // The passcode is deliberately not returned here. It goes only to
      // people who hold a seat (see eventService.getById below).
    },
    trainerIds: (event.trainerIds ?? []).map((id) => id.toString()),
    capacity: event.capacity ?? 0,
    registeredCount: event.registeredCount ?? 0,
    requiresRegistration: event.requiresRegistration ?? false,
    remindBeforeMinutes: event.remindBeforeMinutes ?? [],
    linkedCourseId: event.linkedCourseId ? event.linkedCourseId.toString() : null,
    status: event.status ?? 'PUBLISHED',
    cancelledAt: event.cancelledAt ?? null,
    cancelReason: event.cancelReason ?? '',
    seatsLeft: event.capacity ? Math.max(0, event.capacity - (event.registeredCount ?? 0)) : null,

    createdBy: event.createdBy.toString(),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  }
}

export const eventService = {
  async calendar(query) {
    const rows = await eventRepository.listInRange(query)
    return rows.map(toPublicEvent)
  },

  /**
   * One event, plus this caller's own standing on it.
   *
   * The joining details are only included for somebody who actually holds a
   * seat. A meeting passcode in the catalog response is a passcode in
   * every browser that loaded the page, including the people on the
   * waiting list who were not let in.
   */
  async getById(id, actor = null) {
    const event = await eventRepository.findById(id)
    if (!event) throw ApiError.notFound('Event not found')

    const dto = toPublicEvent(event)
    if (!actor) return dto

    const registration = await EventRegistration.findOne({ eventId: id, userId: actor.id }).lean()
    dto.myRegistration = registration
      ? { status: registration.status, waitlistPosition: registration.waitlistPosition }
      : null

    const isOrganiser =
      String(event.createdBy) === String(actor.id) ||
      (event.trainerIds ?? []).some((trainerId) => String(trainerId) === String(actor.id))
    if (registration?.status === 'REGISTERED' || registration?.status === 'ATTENDED' || isOrganiser) {
      dto.meeting.passcode = event.meeting?.passcode ?? ''
    }
    return dto
  },

  async create(actor, payload) {
    const event = await eventRepository.create({ ...payload, createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'EVENT_CREATED',
      entity: 'Event',
      entityId: event._id.toString(),
      metadata: { title: event.title },
    })

    // Invitations go out for a published event only. Creating a draft is
    // planning; telling people about it is a separate decision.
    if ((event.status ?? 'PUBLISHED') === 'PUBLISHED' && event.participants?.length) {
      await eventNotifyService.invited(event, event.participants).catch((error) => {
        logger.warn('Could not send event invitations', { eventId: String(event._id), error: error.message })
      })
    }

    return toPublicEvent(event)
  },

  async update(actor, id, payload) {
    const existing = await eventRepository.findById(id)
    if (!existing) throw ApiError.notFound('Event not found')

    const previous = { startAt: existing.startAt, endAt: existing.endAt, location: existing.location }
    const cancelling = payload.status === 'CANCELLED' && existing.status !== 'CANCELLED'
    if (cancelling) {
      payload = { ...payload, cancelledAt: new Date() }
    }

    const updated = await eventRepository.updateById(id, payload)

    await auditLogRepository.record({
      actor: actor.id,
      action: cancelling ? 'EVENT_CANCELLED' : 'EVENT_UPDATED',
      entity: 'Event',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })

    // Cancelling wins: telling somebody the time moved and then that it is
    // off would be two contradictory messages about the same event.
    if (cancelling) {
      await eventNotifyService.cancelled(updated, payload.cancelReason ?? '').catch((error) => {
        logger.warn('Could not notify participants of the cancellation', { eventId: id, error: error.message })
      })
      return toPublicEvent(updated)
    }

    // A moved event is the one change everybody has to hear about, because
    // the failure mode is travelling to a session that is not there (AT-32).
    const moved =
      (payload.startAt && new Date(payload.startAt).getTime() !== previous.startAt.getTime()) ||
      (payload.endAt && new Date(payload.endAt).getTime() !== previous.endAt.getTime()) ||
      (payload.location !== undefined && payload.location !== previous.location)

    if (moved && updated.status !== 'CANCELLED') {
      // Reminders already sent are cleared: an event moved from Tuesday to
      // Friday has to remind people again, and the dedup markers would
      // otherwise say it already had.
      await eventRepository.updateById(id, { remindersSentFor: [] })
      await eventNotifyService.rescheduled(updated, previous).catch((error) => {
        logger.warn('Could not notify participants of the change', { eventId: id, error: error.message })
      })
    }

    return toPublicEvent(updated)
  },

  /**
   * The reminder sweep.
   *
   * Reads published events starting within the widest configured offset and
   * sends whichever reminders are now due. `remindersSentFor` is the dedup
   * marker per offset — without it a sweep running every fifteen minutes
   * would send the 60-minute reminder four times.
   */
  async sendDueReminders({ now = new Date() } = {}) {
    const events = await Event.find({
      status: 'PUBLISHED',
      startAt: { $gt: now },
      remindBeforeMinutes: { $exists: true, $ne: [] },
    })

    let sent = 0
    for (const event of events) {
      const already = new Set(event.remindersSentFor ?? [])
      const minutesAway = (event.startAt.getTime() - now.getTime()) / 60000

      // Largest offset first, so an event created inside its own 24-hour
      // window sends the 1440 reminder now rather than at the 60 mark.
      const due = [...(event.remindBeforeMinutes ?? [])]
        .sort((a, b) => b - a)
        .filter((offset) => !already.has(offset) && minutesAway <= offset)

      for (const offset of due) {
        await eventNotifyService.reminder(event, offset).catch((error) => {
          logger.warn('Event reminder failed', { eventId: String(event._id), offset, error: error.message })
        })
        already.add(offset)
        sent += 1
      }

      if (due.length) {
        await Event.updateOne({ _id: event._id }, { $set: { remindersSentFor: [...already] } })
      }
    }

    if (sent) logger.info('Event reminders sent', { events: events.length, reminders: sent })
    return { events: events.length, reminders: sent }
  },

  async remove(actor, id) {
    const existing = await eventRepository.findById(id)
    if (!existing) throw ApiError.notFound('Event not found')
    await eventRepository.deleteById(id)
    await auditLogRepository.record({ actor: actor.id, action: 'EVENT_DELETED', entity: 'Event', entityId: id })
  },
}
