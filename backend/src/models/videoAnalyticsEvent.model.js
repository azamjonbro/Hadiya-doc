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
})

videoAnalyticsEventSchema.index({ sessionId: 1, timestamp: 1 })
videoAnalyticsEventSchema.index({ userId: 1, videoId: 1, timestamp: -1 })
// Raw events are high-volume and only ever read for re-aggregation/audit —
// dashboards read videoProgress/videoSessions instead (spec §38). Expire
// after 180 days so this collection never becomes the bottleneck.
videoAnalyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 })

export const VideoAnalyticsEvent = model('VideoAnalyticsEvent', videoAnalyticsEventSchema)
