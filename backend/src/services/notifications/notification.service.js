import { notificationRepository } from '../../repositories/notification.repository.js'
import { emitNotification } from '../../realtime/socket.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'
import { notificationTemplateService } from './notificationTemplate.service.js'
import { DEFAULT_LANG } from '../../models/notificationTemplate.model.js'

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

/**
 * Renders the in-app wording, or null if there is no template for it.
 *
 * Never throws: a missing or broken template must not stop a course being
 * assigned. The caller falls back to whatever title it was given, and the
 * gap is logged rather than swallowed.
 */
async function renderInApp({ templateKey, vars, lang }) {
  if (!templateKey) return null
  try {
    return await notificationTemplateService.render({
      type: templateKey,
      channel: 'IN_APP',
      lang,
      vars,
    })
  } catch (error) {
    logger.error('Notification template render failed', { templateKey, lang, error: error.message })
    return null
  }
}

export const notificationService = {
  // Called from other services (course assignment, tasks, scheduled
  // reminders, ...) — never exposed as its own authenticated endpoint,
  // since "who to notify" is always decided by the calling domain logic.
  async notify({
    userId,
    type,
    title,
    message = '',
    // The template to render instead of a hand-built title/message. Defaults
    // to `type`, which is what every caller wants — the two are the same
    // string — while leaving room for a type that needs more than one wording.
    templateKey,
    vars = {},
    // 1.3 puts a locale on the user and this reads it. Until then everyone
    // gets Uzbek, which is still an improvement on everyone getting English.
    lang = DEFAULT_LANG,
    relatedEntityType = null,
    relatedEntityId = null,
    severity = 'INFO',
  }) {
    const rendered = await renderInApp({ templateKey: templateKey ?? type, vars, lang })

    const notification = await notificationRepository.create({
      userId,
      type,
      // An explicit title still wins: a few call sites build text a template
      // cannot express yet, and they must not be broken by this change.
      title: title ?? rendered?.subject ?? type,
      message: message || rendered?.body || '',
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
