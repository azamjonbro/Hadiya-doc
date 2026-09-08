import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { auditLogController } from '../../controllers/auditLog.controller.js'
import { auditLogListQuerySchema, auditLogExportQuerySchema } from '../../validators/auditLog.validator.js'

export const auditRouter = Router()

// audit:read ships with ADMIN and SUPERADMIN only. The log holds who did what
// to whom across the whole company, so it is deliberately not part of the
// manager tier's analytics access.
auditRouter.use(authenticate, requirePermission(PERMISSIONS.AUDIT_READ))

auditRouter.get('/', validateQuery(auditLogListQuerySchema), auditLogController.list)
auditRouter.get('/filters', auditLogController.filterOptions)
auditRouter.get('/export', validateQuery(auditLogExportQuerySchema), auditLogController.export)
