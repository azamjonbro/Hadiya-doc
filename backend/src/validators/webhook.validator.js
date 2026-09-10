import { z } from 'zod'
import { WEBHOOK_EVENTS } from '../services/integrations/webhookEvents.js'

// The event names are an enum here as well as a service-level check: a
// typo should be refused with "these are the events" by the validator,
// before any of it reaches the database.
const eventList = z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length)

// Header names and values, not arbitrary objects: a receiver needs a
// gateway token or a tenant id, and anything larger belongs in the body of
// somebody else's API.
const headerMap = z.record(z.string().regex(/^[A-Za-z0-9-]{1,60}$/), z.string().max(300)).optional()

export const createWebhookSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().min(8).max(500),
  events: eventList,
  headers: headerMap,
})

export const updateWebhookSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    url: z.string().trim().min(8).max(500).optional(),
    events: eventList.optional(),
    headers: headerMap,
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' })

export const listDeliveriesSchema = z.object({
  webhookId: z.string().length(24).optional(),
  status: z.enum(['PENDING', 'DELIVERED', 'FAILED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})
