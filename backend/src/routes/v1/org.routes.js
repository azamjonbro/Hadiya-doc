import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { orgController } from '../../controllers/org.controller.js'

export const orgRouter = Router()

orgRouter.use(authenticate)

// No requirePermission here: both routes answer for the caller by default
// and check user:read only when asked about somebody else. Gating the route
// itself would stop an employee seeing their own manager, which is not
// privileged information — it is on their contract.
orgRouter.get('/hierarchy', orgController.hierarchy)
orgRouter.get('/chart', orgController.chart)
