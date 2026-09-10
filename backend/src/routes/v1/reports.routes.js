import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { reportController } from '../../controllers/report.controller.js'
import { reportExportQuerySchema, reportPreviewQuerySchema } from '../../validators/report.validator.js'

export const reportsRouter = Router()

/**
 * Two permissions, not one.
 *
 * `report:view` is reading a report on screen; `report:export` is taking a
 * copy of it away. The whole router used to require export, which made
 * `report:view` a permission that guarded nothing — and since AUTHOR,
 * INSTRUCTOR and MENTOR are granted view without export, all three were
 * locked out of every report route while holding a permission that says
 * otherwise. Roles-as-data only works if granting a permission does
 * something.
 *
 * scopeToManagedUsers puts the caller's allow-list on the request, so a
 * report computes it once instead of per build. reportData.build still falls
 * back to computing it itself when nothing was handed over — the fence must
 * not depend on a route remembering to mount a middleware.
 */
reportsRouter.use(authenticate, scopeToManagedUsers)

const canView = requireAnyPermission(PERMISSIONS.REPORT_VIEW, PERMISSIONS.REPORT_EXPORT)
const canExport = requirePermission(PERMISSIONS.REPORT_EXPORT)

// The catalogue is needed to view or to export, so either permission opens it.
reportsRouter.get('/', canView, reportController.listTypes)

// The caller's own export jobs. Declared before '/:type/...' so
// 'export-jobs' is never read as a report type.
reportsRouter.get('/export-jobs', canExport, reportController.exportJobs)
reportsRouter.get('/export-jobs/:jobId', canExport, reportController.exportJob)

// On screen first (8.2): looking at a report should not cost a download.
reportsRouter.get('/:type/preview', canView, validateQuery(reportPreviewQuerySchema), reportController.preview)

reportsRouter.get('/:type/export', canExport, validateQuery(reportExportQuerySchema), reportController.export)
// The async half of AT-22: the whole population, built by the worker.
reportsRouter.post('/:type/export-job', canExport, validateQuery(reportExportQuerySchema), reportController.queueExport)
