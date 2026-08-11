import { VideoAnalyticsEvent } from '../models/videoAnalyticsEvent.model.js'

export const videoAnalyticsEventRepository = {
  insertMany(events) {
    return VideoAnalyticsEvent.insertMany(events, { ordered: false })
  },
}
