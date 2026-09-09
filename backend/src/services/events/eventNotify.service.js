import { EventRegistration } from '../../models/eventRegistration.model.js'
import { notificationService } from '../notifications/notification.service.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'
import { logger } from '../../config/logger.js'

/**
 * Telling people when an event they are coming to changes.
 *
 * The audience is everybody with a live registration — seat *or* queue.
 * Leaving the waiting list out is the obvious-looking mistake and the
 * wrong one: somebody queued for Thursday's session has arranged their
 * Thursday around possibly attending, and a session moved to Monday
 * concerns them exactly as much.
 *
 * EVENT_CANCELLED and EVENT_RESCHEDULED are mandatory types (§9.3), so
 * they reach people who have muted event notifications. That is deliberate:
 * the failure mode is somebody travelling to a session that is not
 * happening.
 */

async function audienceFor(eventId) {
  const rows = await EventRegistration.find(
    { eventId, status: { $in: ['REGISTERED', 'WAITLIST'] } },
    { userId: 1 }
  ).lean()
  return rows.map((row) => row.userId)
}

/**
 * Sends one notification to everybody on the event.
 *
 * Sequential rather than Promise.all: a hundred parallel notify() calls
 * each render three templates and write a row, and the burst is what makes
 * a 1.9 GB box start swapping. An event audience is tens of people, so the
 * loop costs nothing anybody notices.
 */
async function notifyAll(userIds, payload) {
  let sent = 0
  for (const userId of userIds) {
    try {
      await notificationService.notify({ userId, ...payload })
      sent += 1
    } catch (error) {
      // One recipient's failure must not stop the rest being told.
      logger.warn('Event notification failed for one recipient', {
        userId: String(userId),
        type: payload.type,
        error: error.message,
      })
    }
  }
  return sent
}

export const eventNotifyService = {
  /**
   * The time or place moved (AT-32).
   *
   * `previousStartsAt` is included because "moved to Monday 14:00" without
   * the old time is unreadable to somebody who has three sessions in their
   * calendar and does not know which one this is.
   */
  async rescheduled(event, previous) {
    const userIds = await audienceFor(event._id)
    const sent = await notifyAll(userIds, {
      type: 'EVENT_RESCHEDULED',
      vars: {
        eventTitle: event.title,
        startsAt: formatNotificationDate(event.startAt),
        previousStartsAt: formatNotificationDate(previous.startAt),
        location: event.location || '',
      },
      relatedEntityType: 'Event',
      relatedEntityId: String(event._id),
      severity: 'WARNING',
    })
    logger.info('Event rescheduled, participants notified', { eventId: String(event._id), sent })
    return sent
  },

  async cancelled(event, reason = '') {
    const userIds = await audienceFor(event._id)
    const sent = await notifyAll(userIds, {
      type: 'EVENT_CANCELLED',
      vars: {
        eventTitle: event.title,
        startsAt: formatNotificationDate(event.startAt),
        reason,
      },
      relatedEntityType: 'Event',
      relatedEntityId: String(event._id),
      severity: 'CRITICAL',
    })
    logger.info('Event cancelled, participants notified', { eventId: String(event._id), sent })
    return sent
  },

  /** The invitation, when an event is published with people on it. */
  async invited(event, userIds) {
    if (!userIds?.length) return 0
    return notifyAll(userIds, {
      type: 'EVENT_INVITATION',
      vars: {
        eventTitle: event.title,
        startsAt: formatNotificationDate(event.startAt),
        location: event.location || '',
      },
      relatedEntityType: 'Event',
      relatedEntityId: String(event._id),
    })
  },

  /**
   * "It starts soon" — sent by the reminder sweep.
   *
   * `minutesBefore` is not passed to the template: the seeded allowlist for
   * EVENT_REMINDER does not include it, and the renderer rejects a
   * placeholder outside the allowlist rather than interpolating it. The
   * offset decides *when* the reminder goes, not what it says.
   */
  async reminder(event, minutesBefore) {
    const userIds = await audienceFor(event._id)
    return notifyAll(userIds, {
      type: 'EVENT_REMINDER',
      vars: {
        eventTitle: event.title,
        startsAt: formatNotificationDate(event.startAt),
        location: event.location || '',
      },
      relatedEntityType: 'Event',
      relatedEntityId: String(event._id),
    })
  },
}
