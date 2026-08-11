import { eventRepository } from '../../repositories/event.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
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
    participants: event.participants.map((p) => p.toString()),
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

  async getById(id) {
    const event = await eventRepository.findById(id)
    if (!event) throw ApiError.notFound('Event not found')
    return toPublicEvent(event)
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
