import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { reportController } from '../../controllers/report.controller.js'
import { reportExportQuerySchema } from '../../validators/report.validator.js'

export const reportsRouter = Router()

reportsRouter.use(authenticate, requirePermission(PERMISSIONS.REPORT_EXPORT))

reportsRouter.get('/', reportController.listTypes)
reportsRouter.get('/:type/export', validateQuery(reportExportQuerySchema), reportController.export)
