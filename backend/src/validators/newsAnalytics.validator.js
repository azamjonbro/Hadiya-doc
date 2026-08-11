import { z } from 'zod'

const newsEventSchema = z.object({
  eventType: z.enum(['opened', 'scroll', 'timeSpent']),
  timestamp: z.string().min(1),
  depth: z.number().min(0).max(100).optional(),
  duration: z.number().optional(),
})

export const newsEventsBatchSchema = z.object({
  events: z.array(newsEventSchema).min(1).max(200),
})
