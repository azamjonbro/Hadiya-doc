import { Event } from '../models/event.model.js'

export const eventRepository = {
  findById(id) {
    return Event.findById(id)
  },

  create(data) {
    return Event.create(data)
  },

  updateById(id, data) {
    return Event.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return Event.findByIdAndDelete(id)
  },

  listInRange({ from, to }) {
    const filter = {}
    if (from || to) {
      filter.startAt = {}
      if (from) filter.startAt.$gte = from
      if (to) filter.startAt.$lte = to
    }
    return Event.find(filter).sort({ startAt: 1 })
  },
}
