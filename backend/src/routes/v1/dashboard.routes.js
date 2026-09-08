import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { dashboardController } from '../../controllers/dashboard.controller.js'

export const dashboardRouter = Router()

dashboardRouter.use(authenticate, requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL), scopeToManagedUsers)

dashboardRouter.get('/', dashboardController.get)
// Same permission, different population. analytics:view:all is what says
// "may see figures about other people at all"; role.scope is what says how
// many of them — the split 2.2 introduced.
dashboardRouter.get('/team', dashboardController.team)
