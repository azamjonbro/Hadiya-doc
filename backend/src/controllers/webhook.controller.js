import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { webhookService } from '../services/integrations/webhook.service.js'

export const webhookController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await webhookService.list())
  }),

  /** The catalogue, so the form does not hardcode a second copy of it. */
  events: asyncHandler(async (req, res) => {
    sendSuccess(res, webhookService.events())
  }),

  /** 201 with the signing secret — the only time it is returned. */
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await webhookService.create(req.user, req.body), 'Subscription created — copy the secret now', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await webhookService.update(req.user, req.params.id, req.body), 'Saved')
  }),

  rotate: asyncHandler(async (req, res) => {
    sendSuccess(res, await webhookService.rotateSecret(req.user, req.params.id), 'New secret — copy it now')
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await webhookService.remove(req.user, req.params.id), 'Subscription deleted')
  }),

  deliveries: asyncHandler(async (req, res) => {
    // validateQuery writes to req.validatedQuery — req.query is the raw,
    // uncoerced object (9.5 learned this the hard way: `limit=3` echoed as
    // the string "3").
    sendSuccess(res, await webhookService.deliveries(req.validatedQuery ?? {}))
  }),

  replay: asyncHandler(async (req, res) => {
    sendSuccess(res, await webhookService.replay(req.user, req.params.deliveryId), 'Queued again', 202)
  }),

  ping: asyncHandler(async (req, res) => {
    sendSuccess(res, await webhookService.ping(req.user, req.params.id), 'Test event queued', 202)
  }),
}
