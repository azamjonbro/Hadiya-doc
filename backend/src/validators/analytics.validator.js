import { z } from 'zod'

const analyticsEventSchema = z.object({
  eventType: z.string().min(1),
  timestamp: z.string().min(1),
  position: z.number().optional(),
  duration: z.number().optional(),
  metadata: z.record(z.any()).optional().default({}),
  /**
   * The client's own id for this event (12.3).
   *
   * Optional, because a client from before this existed does not send one
   * and must keep working. When present it is what makes a replayed
   * offline queue safe — see videoAnalyticsEvent.model.js.
   */
  clientEventId: z.string().trim().min(8).max(64).optional(),
})

export const videoEventsBatchSchema = z.object({
  sessionId: z.string().min(1),
  videoId: z.string().min(1),
  events: z.array(analyticsEventSchema).min(1).max(200),
})
