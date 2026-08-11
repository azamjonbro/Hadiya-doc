import { Notification } from '../models/notification.model.js'

export const notificationRepository = {
  create(data) {
    return Notification.create(data)
  },

  findById(id) {
    return Notification.findById(id)
  },

  listByUser({ userId, cursor, limit }) {
    const filter = { userId }
    if (cursor) filter._id = { $lt: cursor }
    return Notification.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },

  countUnread(userId) {
    return Notification.countDocuments({ userId, read: false })
  },

  markRead(id) {
    return Notification.findByIdAndUpdate(id, { $set: { read: true } }, { new: true })
  },

  markAllRead(userId) {
    return Notification.updateMany({ userId, read: false }, { $set: { read: true } })
  },
}
