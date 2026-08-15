import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireRole } from '../../middlewares/rbac.middleware.js'
import { trashController } from '../../controllers/trash.controller.js'

export const trashRouter = Router()

trashRouter.use(authenticate)

// One page for everything an admin deleted. `course:delete` is the gate for
// the page as a whole — the per-type checks live in each type's own service,
// which is where they already were.
trashRouter.get('/', requirePermission(PERMISSIONS.COURSE_DELETE), trashController.list)
trashRouter.post('/:type/:id/restore', requirePermission(PERMISSIONS.COURSE_DELETE), trashController.restore)
// Emptying the bin early is irreversible, so it keeps the same SUPERADMIN
// rule the permanent course delete already had.
trashRouter.delete(
  '/:type/:id',
  requirePermission(PERMISSIONS.COURSE_DELETE),
  requireRole('SUPERADMIN'),
  trashController.destroy
)
