import { Router } from 'express'
import { ROLES } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { webhookController } from '../../controllers/webhook.controller.js'
import {
  createWebhookSchema,
  listDeliveriesSchema,
  updateWebhookSchema,
} from '../../validators/webhook.validator.js'

export const webhooksRouter = Router()

webhooksRouter.use(authenticate)

/**
 * SUPERADMIN, as a role — the same reasoning as API keys (11.1), and one
 * step stronger: a subscription makes this platform send company data
 * *outwards* to an address of the operator's choosing, and the request
 * leaves from inside the network. That is not a permission to spread
 * around.
 */
webhooksRouter.use(requireRole(ROLES.SUPERADMIN))

webhooksRouter.get('/', webhookController.list)
webhooksRouter.get('/events', webhookController.events)
// Before /:id so "deliveries" is never read as an id.
webhooksRouter.get('/deliveries', validateQuery(listDeliveriesSchema), webhookController.deliveries)
webhooksRouter.post('/deliveries/:deliveryId/replay', webhookController.replay)
webhooksRouter.post('/', validateBody(createWebhookSchema), webhookController.create)
webhooksRouter.patch('/:id', validateBody(updateWebhookSchema), webhookController.update)
webhooksRouter.post('/:id/rotate-secret', webhookController.rotate)
webhooksRouter.post('/:id/ping', webhookController.ping)
webhooksRouter.delete('/:id', webhookController.remove)
