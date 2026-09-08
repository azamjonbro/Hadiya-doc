import { z } from 'zod'

export const listNotificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

// POST /push/subscribe — exactly the shape `PushSubscription.toJSON()` gives
// in the browser, so the client can hand it over untouched.
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url('endpoint must be the URL the browser issued'),
  keys: z
    .object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    })
    .strict(),
})

// DELETE /push/subscribe — no endpoint means "this account, every browser",
// which is what a "sign me out of push everywhere" button sends.
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().optional(),
})
