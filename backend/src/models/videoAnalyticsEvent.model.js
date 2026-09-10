import { Schema, model } from 'mongoose'

const videoAnalyticsEventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true },
  videoId: { type: Schema.Types.ObjectId, ref: 'Video', required: true },
  eventType: { type: String, required: true },
  timestamp: { type: Date, required: true },
  position: { type: Number, default: null },
  duration: { type: Number, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  device: { type: String, default: '' },
  browser: { type: String, default: '' },

  /**
   * The client's own id for this event (12.3).
   *
   * Generated where the event happens — in the player, offline, possibly
   * hours before it is sent. It is what makes a **replayed queue** safe: a
   * phone that lost signal for five minutes and then syncs twice (two
   * tabs, or a Background Sync retry racing a manual flush) must add 300
   * watched seconds, not 600 (AT-35).
   *
   * Absent on events sent by clients from before this existed, which is
   * why the unique index below is partial: a plain one would let the
   * second such event collide with the first.
   */
  clientEventId: { type: String, default: undefined },
})

/**
 * The dedupe ledger *is* this collection.
 *
 * Rather than a separate table of seen ids, the unique index does the
 * work: `insertMany({ ordered: false })` inserts the new events and
 * reports the repeats as duplicate-key errors, so the processor knows
 * exactly which events are new and counts only those. One source of
 * truth, and no second collection that can disagree with this one.
 *
 * Scoped by user: a client id is generated on a device and two devices
 * could in principle produce the same string; one person's event must
 * never suppress another's.
 */
videoAnalyticsEventSchema.index(
  { userId: 1, clientEventId: 1 },
  { unique: true, partialFilterExpression: { clientEventId: { $type: 'string' } } }
)

videoAnalyticsEventSchema.index({ sessionId: 1, timestamp: 1 })
videoAnalyticsEventSchema.index({ userId: 1, videoId: 1, timestamp: -1 })
// Raw events are high-volume and only ever read for re-aggregation/audit —
// dashboards read videoProgress/videoSessions instead (spec §38). Expire
// after 180 days so this collection never becomes the bottleneck.
videoAnalyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 })

export const VideoAnalyticsEvent = model('VideoAnalyticsEvent', videoAnalyticsEventSchema)
