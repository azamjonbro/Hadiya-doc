import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { pushController } from '../../controllers/push.controller.js'
import { pushSubscribeSchema, pushUnsubscribeSchema } from '../../validators/notification.validator.js'

export const pushRouter = Router()

pushRouter.use(authenticate)

// Every route here acts on the caller's own subscriptions — `req.user.id` is
// the only id involved — so authenticate is the whole gate. There is nothing
// a permission could be checked against.
pushRouter.get('/public-key', pushController.publicKey)
pushRouter.get('/subscriptions', pushController.list)
pushRouter.post('/subscribe', validateBody(pushSubscribeSchema), pushController.subscribe)
pushRouter.delete('/subscribe', validateBody(pushUnsubscribeSchema), pushController.unsubscribe)
