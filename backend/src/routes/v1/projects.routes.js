import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { projectController } from '../../controllers/project.controller.js'
import {
  createProjectSchema,
  projectNameSchema,
  addMembersSchema,
  memberAccessSchema,
  candidatesQuerySchema,
} from '../../validators/project.validator.js'

export const projectsRouter = Router()

projectsRouter.use(authenticate)

// Reading the folder list is part of reading the library; making one is
// authoring. Who may rename, delete or change members is decided per
// project in the service (owner or admin), not by a permission.
projectsRouter.get('/', requirePermission(PERMISSIONS.COURSE_READ), projectController.list)
// Before '/:id', or "candidates" would be read as a project id.
projectsRouter.get(
  '/candidates',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  validateQuery(candidatesQuerySchema),
  projectController.candidates
)
projectsRouter.post('/', requirePermission(PERMISSIONS.COURSE_CREATE), validateBody(createProjectSchema), projectController.create)
projectsRouter.get('/:id', requirePermission(PERMISSIONS.COURSE_READ), projectController.get)
projectsRouter.patch('/:id', requirePermission(PERMISSIONS.COURSE_CREATE), validateBody(projectNameSchema), projectController.rename)
projectsRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_CREATE), projectController.remove)
projectsRouter.post(
  '/:id/members',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  validateBody(addMembersSchema),
  projectController.addMembers
)
projectsRouter.patch(
  '/:id/members/:userId',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  validateBody(memberAccessSchema),
  projectController.setMemberAccess
)
projectsRouter.delete('/:id/members/:userId', requirePermission(PERMISSIONS.COURSE_READ), projectController.removeMember)
