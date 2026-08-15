import { notificationRepository } from '../../repositories/notification.repository.js'
import { emitNotification } from '../../realtime/socket.js'
import { ApiError } from '../../utils/ApiError.js'

function toPublicNotification(n) {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    relatedEntityType: n.relatedEntityType,
    relatedEntityId: n.relatedEntityId,
    severity: n.severity,
    read: n.read,
    createdAt: n.createdAt,
  }
}

export const notificationService = {
  // Called from other services (course assignment, tasks, scheduled
  // reminders, ...) — never exposed as its own authenticated endpoint,
  // since "who to notify" is always decided by the calling domain logic.
  async notify({ userId, type, title, message = '', relatedEntityType = null, relatedEntityId = null, severity = 'INFO' }) {
    const notification = await notificationRepository.create({
      userId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
      severity,
    })

    // Pushed the moment it is persisted, so the bell badge and toast are
    // live for every notification type (task assigned, course assigned,
    // deadline reminders, ...) instead of waiting out the client's 45s
    // poll. Every caller of notify() gets this for free — deliberately
    // done here rather than at each call site.
    emitNotification(String(userId), toPublicNotification(notification))

    return notification
  },

  async list(actor, query) {
    const rows = await notificationRepository.listByUser({ userId: actor.id, ...query })
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    const unreadCount = await notificationRepository.countUnread(actor.id)
    return {
      items: items.map(toPublicNotification),
      nextCursor: hasMore ? items[items.length - 1]._id.toString() : null,
      unreadCount,
    }
  },

  async markRead(actor, id) {
    const notification = await notificationRepository.findById(id)
    if (!notification) throw ApiError.notFound('Notification not found')
    if (notification.userId.toString() !== actor.id) throw ApiError.forbidden()
    const updated = await notificationRepository.markRead(id)
    return toPublicNotification(updated)
  },

  async markAllRead(actor) {
    await notificationRepository.markAllRead(actor.id)
  },
}
