import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { ojtController } from '../../controllers/ojt.controller.js'
import {
  createChecklistSchema,
  createScaleSchema,
  updateScaleSchema,
  updateChecklistSchema,
  listChecklistsSchema,
  createSessionSchema,
  listSessionsSchema,
  recordObservationSchema,
  completeSessionSchema,
  signOffSchema,
  cancelSessionSchema,
} from '../../validators/ojt.validator.js'

/**
 * On-the-job training (13.3).
 *
 * Two permissions, two jobs: `ojt:manage` designs the checklists and
 * schedules who watches whom; `ojt:observe` is the person standing on the
 * shop floor with a phone. They are separate because the second one is
 * handed to shift supervisors and mentors, and designing the standard
 * everybody is judged against is not part of that.
 *
 * The narrower fence — "this observer, this session" — is not a permission
 * and cannot be one: it depends on the row. It is checked in the service,
 * on every write.
 */
export const ojtRouter = Router()

ojtRouter.use(authenticate)

// ---------------------------------------------------------------------- scales
// Rating scales for checklist items. Read by observers (a session's items
// carry a copy, but the editor needs the catalogue), written by ojt:manage.
ojtRouter.get('/scales', requireAnyPermission(PERMISSIONS.OJT_OBSERVE, PERMISSIONS.OJT_MANAGE), ojtController.listScales)
ojtRouter.post('/scales', requirePermission(PERMISSIONS.OJT_MANAGE), validateBody(createScaleSchema), ojtController.createScale)
ojtRouter.patch('/scales/:id', requirePermission(PERMISSIONS.OJT_MANAGE), validateBody(updateScaleSchema), ojtController.updateScale)
ojtRouter.delete('/scales/:id', requirePermission(PERMISSIONS.OJT_MANAGE), ojtController.removeScale)

// ------------------------------------------------------------------ checklists
// Readable by anybody who observes: a session's items make no sense without
// the standard behind them. Writing is ojt:manage.
ojtRouter.get(
  '/checklists',
  requireAnyPermission(PERMISSIONS.OJT_OBSERVE, PERMISSIONS.OJT_MANAGE),
  validateQuery(listChecklistsSchema),
  ojtController.listChecklists
)
ojtRouter.post(
  '/checklists',
  requirePermission(PERMISSIONS.OJT_MANAGE),
  validateBody(createChecklistSchema),
  ojtController.createChecklist
)
ojtRouter.get(
  '/checklists/:id',
  requireAnyPermission(PERMISSIONS.OJT_OBSERVE, PERMISSIONS.OJT_MANAGE),
  ojtController.getChecklist
)
ojtRouter.patch(
  '/checklists/:id',
  requirePermission(PERMISSIONS.OJT_MANAGE),
  validateBody(updateChecklistSchema),
  ojtController.updateChecklist
)
ojtRouter.delete('/checklists/:id', requirePermission(PERMISSIONS.OJT_MANAGE), ojtController.removeChecklist)

// -------------------------------------------------------------------- sessions
// `scopeToManagedUsers` puts the caller's allow-list on the request; the
// service narrows the trainee filter with it, so a manager sees their own
// people and an observer sees the sessions they were named on.
ojtRouter.get(
  '/sessions',
  requireAnyPermission(PERMISSIONS.OJT_OBSERVE, PERMISSIONS.OJT_MANAGE),
  scopeToManagedUsers,
  validateQuery(listSessionsSchema),
  ojtController.listSessions
)
ojtRouter.post(
  '/sessions',
  requirePermission(PERMISSIONS.OJT_MANAGE),
  validateBody(createSessionSchema),
  ojtController.createSession
)
ojtRouter.get(
  '/sessions/:id',
  requireAnyPermission(PERMISSIONS.OJT_OBSERVE, PERMISSIONS.OJT_MANAGE),
  scopeToManagedUsers,
  ojtController.getSession
)

ojtRouter.post('/sessions/:id/start', requirePermission(PERMISSIONS.OJT_OBSERVE), ojtController.startSession)

// The one endpoint that has to survive a basement. It is a full replacement
// of one verdict, upserted on (session, item), so the offline queue (12.3)
// can replay it without counting anything twice.
ojtRouter.put(
  '/sessions/:id/observations/:itemId',
  requirePermission(PERMISSIONS.OJT_OBSERVE),
  validateBody(recordObservationSchema),
  ojtController.recordObservation
)

ojtRouter.post(
  '/sessions/:id/complete',
  requirePermission(PERMISSIONS.OJT_OBSERVE),
  validateBody(completeSessionSchema),
  ojtController.completeSession
)
// Signing posts levels to the skill matrix, so it is gated on either
// permission and audited — see ojt.service.js.
ojtRouter.post(
  '/sessions/:id/sign-off',
  requireAnyPermission(PERMISSIONS.OJT_OBSERVE, PERMISSIONS.OJT_MANAGE),
  validateBody(signOffSchema),
  ojtController.signOff
)
ojtRouter.post(
  '/sessions/:id/cancel',
  requirePermission(PERMISSIONS.OJT_MANAGE),
  validateBody(cancelSessionSchema),
  ojtController.cancelSession
)
