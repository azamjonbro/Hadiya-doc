import { z } from 'zod'

const analyticsEventSchema = z.object({
  eventType: z.string().min(1),
  timestamp: z.string().min(1),
  position: z.number().optional(),
  duration: z.number().optional(),
  metadata: z.record(z.any()).optional().default({}),
})

export const videoEventsBatchSchema = z.object({
  sessionId: z.string().min(1),
  videoId: z.string().min(1),
  events: z.array(analyticsEventSchema).min(1).max(200),
})
