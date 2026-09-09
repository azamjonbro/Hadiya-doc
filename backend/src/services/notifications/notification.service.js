import { notificationRepository } from '../../repositories/notification.repository.js'
import { emitNotification } from '../../realtime/socket.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'
import { notificationTemplateService } from './notificationTemplate.service.js'
import { DEFAULT_LANG } from '../../models/notificationTemplate.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { isChannelEnabled } from '@lms/shared'
import { enqueueMail } from '../../jobs/deliveryQueue.js'
import { pushService, isPushConfigured } from './push.service.js'
import { env } from '../../config/env.js'

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

/**
 * Queues the email half of a notification, if there is one to send.
 *
 * Four separate reasons not to send, each of them ordinary rather than an
 * error: no account, no address on it, the person switched this type's email
 * off, or no EMAIL template exists for the type. Only the third is a
 * decision; the rest are just facts about the deployment.
 */
async function queueEmail({ recipient, type, templateKey, vars, lang, prefs }) {
  if (!recipient?.email) return null
  if (!isChannelEnabled(prefs, type, 'email')) return null

  try {
    const rendered = await notificationTemplateService.render({
      type: templateKey,
      channel: 'EMAIL',
      lang,
      vars: { userName: recipient.fullName ?? '', appUrl: env.APP_URL, ...vars },
    })
    if (!rendered) return null

    return await enqueueMail({
      to: recipient.email,
      subject: rendered.subject,
      text: rendered.body,
      templateKey,
      userId: recipient._id,
    })
  } catch (error) {
    // Logged, not thrown: the in-app notification has already been written
    // and pushed, and losing the email is strictly better than rolling back
    // the thing that caused it.
    logger.error('Could not queue notification email', {
      type,
      userId: String(recipient._id),
      error: error.message,
    })
    return null
  }
}

/**
 * Pushes to the person's browsers, if they have any and want this type.
 *
 * Deliberately after the mail: push is a nudge, mail is the record, and if
 * something is going to be slow it should be the one that is not blocking
 * the queue behind it. Failures never reach the caller — sendToUser already
 * swallows per-subscription errors, and this catches the rest.
 */
async function sendPush({ recipient, type, templateKey, vars, lang, prefs }) {
  if (!isPushConfigured() || !recipient) return null
  if (!isChannelEnabled(prefs, type, 'push')) return null

  try {
    const rendered = await notificationTemplateService.render({
      type: templateKey,
      channel: 'PUSH',
      lang,
      vars: { userName: recipient.fullName ?? '', appUrl: env.APP_URL, ...vars },
    })
    if (!rendered) return null

    return await pushService.sendToUser(recipient._id, {
      title: rendered.subject,
      body: rendered.body,
      url: env.APP_URL,
      // One notification of a given type replaces the previous one on the
      // lock screen instead of stacking: three "deadline approaching"
      // banners are not three times as useful.
      tag: type,
    })
  } catch (error) {
    logger.error('Could not push notification', {
      type,
      userId: String(recipient._id),
      error: error.message,
    })
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

/**
 * Everything notify() does once it knows who it is writing to.
 *
 * Split out from notify() so a bulk caller can load its recipients in one
 * query and still go down exactly this path — see notifyMany. Nothing else
 * should call it: `recipient` is the only thing it trusts to have been
 * looked up already.
 */
async function deliver(
  {
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
    // already know it; otherwise it is read from the account.
    lang,
    relatedEntityType = null,
    relatedEntityId = null,
    severity = 'INFO',
  },
  recipient
) {
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

  // Mail is queued, never awaited, and never allowed to fail the caller.
  // It is the slowest and least reliable thing the platform does, and the
  // in-app notification above is already delivered: a relay being down
  // must not undo a course assignment.
  await queueEmail({ recipient, type, templateKey: templateKey ?? type, vars, lang: language, prefs })
  await sendPush({ recipient, type, templateKey: templateKey ?? type, vars, lang: language, prefs })

  return notification
}

export const notificationService = {
  // Called from other services (course assignment, tasks, scheduled
  // reminders, ...) — never exposed as its own authenticated endpoint,
  // since "who to notify" is always decided by the calling domain logic.
  async notify(params) {
    // One read per notification, answering both questions: which language to
    // write in, and which channels this person still wants. A notification is
    // composed on the server — often hours later by a cron job — so there is
    // no browser whose language could be used instead.
    //
    // Passing prefs down from every call site is the alternative, and it puts
    // "does this person want email" into services that have no business
    // knowing. So a loop that notifies many people reaches for notifyMany
    // below instead, which is the same path with the reads done once.
    return deliver(params, await loadRecipient(params.userId))
  },

  /**
   * The same notification path for a batch of recipients, with their accounts
   * read in one query instead of one per message.
   *
   * Sent in order and one at a time on purpose: the delivery each message
   * triggers (a socket emit, a queued mail, a web push) is not something to
   * fire in parallel bursts at a 1.9 GB box, and the reminder sweep that uses
   * this is not in a hurry. What it must not do is spend a round trip per
   * recipient — which is what this exists to fix.
   *
   * Returns the created notifications, `null` in the slots where the
   * recipient had in-app notifications switched off, so a caller can tell
   * which ones were actually written.
   */
  async notifyMany(items = []) {
    if (!items.length) return []
    const userIds = [...new Set(items.map((item) => String(item.userId)))]
    const accounts = await userRepository.findByIds(userIds)
    const byId = new Map(accounts.map((account) => [account._id.toString(), account]))

    const results = []
    for (const item of items) {
      results.push(await deliver(item, byId.get(String(item.userId)) ?? null))
    }
    return results
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
