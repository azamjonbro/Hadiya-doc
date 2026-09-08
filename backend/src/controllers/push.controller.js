import { pushService, isPushConfigured } from '../services/notifications/push.service.js'
import { env } from '../config/env.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const pushController = {
  // The browser needs the public key before it can ask for permission, and
  // it is public by definition — the private half never leaves the server.
  // `enabled` lets the client skip the whole prompt when push is not
  // configured, rather than asking for a permission it cannot use.
  publicKey: asyncHandler(async (_req, res) => {
    sendSuccess(res, { enabled: isPushConfigured(), publicKey: env.VAPID_PUBLIC_KEY })
  }),

  subscribe: asyncHandler(async (req, res) => {
    const subscription = await pushService.subscribe(req.user.id, {
      ...req.body,
      // Recorded from the request rather than trusted from the body: it is
      // only there to label the row in the settings screen.
      userAgent: req.get('user-agent') ?? '',
    })
    sendSuccess(res, { id: subscription._id.toString() }, 'Subscribed')
  }),

  unsubscribe: asyncHandler(async (req, res) => {
    const removed = await pushService.unsubscribe(req.user.id, req.body.endpoint)
    sendSuccess(res, { removed }, 'Unsubscribed')
  }),

  list: asyncHandler(async (req, res) => {
    const rows = await pushService.list(req.user.id)
    sendSuccess(
      res,
      rows.map((row) => ({
        id: row._id.toString(),
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        lastSuccessAt: row.lastSuccessAt,
      }))
    )
  }),
}
