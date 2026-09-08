import { notificationRepository } from '../../repositories/notification.repository.js'
import { emitNotification } from '../../realtime/socket.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'
import { notificationTemplateService } from './notificationTemplate.service.js'
import { DEFAULT_LANG } from '../../models/notificationTemplate.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { isChannelEnabled } from '@lms/shared'

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
/**
 * The recipient's locale and channel preferences.
 *
 * Never throws: a notification for an account that has since been deleted
 * should be a no-op with a log line, not an exception that rolls back the
 * course assignment that triggered it.
 */
async function loadRecipient(userId) {
  try {
    return await userRepository.findById(String(userId))
  } catch (error) {
    logger.warn('Could not read notification recipient', { userId: String(userId), error: error.message })
    return null
  }
}

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
    // Overrides the recipient's own locale. Only passed by callers that
    // already know it; otherwise it is read from the account below.
    lang,
    relatedEntityType = null,
    relatedEntityId = null,
    severity = 'INFO',
  }) {
    // One read per notification, answering both questions: which language to
    // write in, and which channels this person still wants. A notification is
    // composed on the server — often hours later by a cron job — so there is
    // no browser whose language could be used instead.
    //
    // It is a read per recipient in the bulk-assignment loops, which is a
    // cost worth naming: the alternative is passing prefs down from every
    // call site, which puts "does this person want email" into services that
    // have no business knowing. If those loops become hot, the fix is a
    // notifyMany() that loads the recipients in one query — not spreading
    // this decision outwards.
    const recipient = await loadRecipient(userId)
    const language = lang ?? recipient?.locale ?? DEFAULT_LANG
    const prefs = recipient?.notificationPrefs ?? {}

    const rendered = await renderInApp({
      templateKey: templateKey ?? type,
      // userName is in almost every template and no call site has it to
      // hand; filling it here keeps the callers about their own domain.
      vars: { userName: recipient?.fullName ?? '', ...vars },
      lang: language,
    })

    // In-app is a preference like any other channel — except that switching
    // it off must not lose the record, only the delivery. Mandatory types
    // ignore this entirely (isChannelEnabled returns true for them).
    if (!isChannelEnabled(prefs, type, 'inApp')) {
      return null
    }

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
