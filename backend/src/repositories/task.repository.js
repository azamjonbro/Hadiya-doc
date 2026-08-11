import { Task } from '../models/task.model.js'

export const taskRepository = {
  findById(id) {
    return Task.findById(id)
  },

  create(data) {
    return Task.create(data)
  },

  updateById(id, data) {
    return Task.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return Task.findByIdAndDelete(id)
  },

  listByAssignee({ assignedTo, status, cursor, limit }) {
    const filter = { assignedTo }
    if (status) filter.status = status
    if (cursor) filter._id = { $gt: cursor }
    return Task.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },

  listByAssigner({ assignedBy, status, cursor, limit }) {
    const filter = { assignedBy }
    if (status) filter.status = status
    if (cursor) filter._id = { $gt: cursor }
    return Task.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },
}
