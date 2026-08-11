import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { dashboardController } from '../../controllers/dashboard.controller.js'

export const dashboardRouter = Router()

dashboardRouter.use(authenticate, requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL))

dashboardRouter.get('/', dashboardController.get)
