import { eventRepository } from '../../repositories/event.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { EventRegistration } from '../../models/eventRegistration.model.js'
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
    return toPublicEvent(event)
  },

  async update(actor, id, payload) {
    const existing = await eventRepository.findById(id)
    if (!existing) throw ApiError.notFound('Event not found')
    const updated = await eventRepository.updateById(id, payload)
    await auditLogRepository.record({
      actor: actor.id,
      action: 'EVENT_UPDATED',
      entity: 'Event',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublicEvent(updated)
  },

  async remove(actor, id) {
    const existing = await eventRepository.findById(id)
    if (!existing) throw ApiError.notFound('Event not found')
    await eventRepository.deleteById(id)
    await auditLogRepository.record({ actor: actor.id, action: 'EVENT_DELETED', entity: 'Event', entityId: id })
  },
}
