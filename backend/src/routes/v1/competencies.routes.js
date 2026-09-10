import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { competencyController } from '../../controllers/competency.controller.js'
import {
  createCompetencySchema,
  updateCompetencySchema,
  assessSchema,
  matrixQuerySchema,
  listCompetenciesQuerySchema,
} from '../../validators/competency.validator.js'

export const competenciesRouter = Router()

competenciesRouter.use(authenticate)

// 'mine' and 'matrix' are declared before '/:id' so neither is ever read as
// a competency id.
competenciesRouter.get('/mine', competencyController.mine)

competenciesRouter.get(
  '/matrix',
  requireAnyPermission(PERMISSIONS.COMPETENCY_ASSESS, PERMISSIONS.COMPETENCY_MANAGE),
  scopeToManagedUsers,
  validateQuery(matrixQuerySchema),
  competencyController.matrix
)

// Recording a level is the assessor's act; HR's catalogue permission carries
// it too, because somebody who may rewrite the scale can obviously use it.
competenciesRouter.post(
  '/assessments',
  requireAnyPermission(PERMISSIONS.COMPETENCY_ASSESS, PERMISSIONS.COMPETENCY_MANAGE),
  scopeToManagedUsers,
  validateBody(assessSchema),
  competencyController.assess
)

competenciesRouter.get(
  '/users/:userId',
  requireAnyPermission(PERMISSIONS.COMPETENCY_ASSESS, PERMISSIONS.COMPETENCY_MANAGE),
  scopeToManagedUsers,
  competencyController.forUser
)

// Reading the catalogue is open to both: the matrix screen needs the names
// and the assessor needs the ladder to pick a level from. Archived entries
// are hidden from everyone but a manager of the catalogue — the service
// decides that, from the same actor.
competenciesRouter.get(
  '/',
  requireAnyPermission(PERMISSIONS.COMPETENCY_ASSESS, PERMISSIONS.COMPETENCY_MANAGE),
  validateQuery(listCompetenciesQuerySchema),
  competencyController.list
)

competenciesRouter.post(
  '/',
  requirePermission(PERMISSIONS.COMPETENCY_MANAGE),
  validateBody(createCompetencySchema),
  competencyController.create
)

competenciesRouter.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.COMPETENCY_ASSESS, PERMISSIONS.COMPETENCY_MANAGE),
  competencyController.getOne
)

competenciesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COMPETENCY_MANAGE),
  validateBody(updateCompetencySchema),
  competencyController.update
)

competenciesRouter.delete('/:id', requirePermission(PERMISSIONS.COMPETENCY_MANAGE), competencyController.remove)
