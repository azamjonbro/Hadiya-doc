import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { reportController } from '../../controllers/report.controller.js'
import { reportExportQuerySchema } from '../../validators/report.validator.js'

export const reportsRouter = Router()

// scopeToManagedUsers puts the caller's allow-list on the request, so an
// export computes it once instead of per report. reportData.build still
// falls back to computing it itself when nothing was handed over — the
// fence must not depend on a route remembering to mount a middleware.
reportsRouter.use(authenticate, requirePermission(PERMISSIONS.REPORT_EXPORT), scopeToManagedUsers)

reportsRouter.get('/', reportController.listTypes)
reportsRouter.get('/:type/export', validateQuery(reportExportQuerySchema), reportController.export)
