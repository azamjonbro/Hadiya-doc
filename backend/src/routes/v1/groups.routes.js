import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { groupController } from '../../controllers/group.controller.js'
import {
  createGroupSchema,
  updateGroupSchema,
  groupMembersSchema,
  groupCoursesSchema,
  listGroupsQuerySchema,
} from '../../validators/group.validator.js'

export const groupsRouter = Router()

groupsRouter.use(authenticate)

// Reading a group is reading a roster, so it rides on user:read; every
// mutation opens or revokes course access, which is exactly course:assign.
// Both are already held by MANAGER and above, so no role migration is
// needed for an existing deployment.
groupsRouter.get('/', requirePermission(PERMISSIONS.USER_READ), validateQuery(listGroupsQuerySchema), groupController.list)
groupsRouter.get('/:id', requirePermission(PERMISSIONS.USER_READ), groupController.getById)

groupsRouter.post('/', requirePermission(PERMISSIONS.COURSE_ASSIGN), validateBody(createGroupSchema), groupController.create)
groupsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  validateBody(updateGroupSchema),
  groupController.update
)
groupsRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_ASSIGN), groupController.remove)

groupsRouter.post(
  '/:id/members',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  validateBody(groupMembersSchema),
  groupController.addMembers
)
groupsRouter.delete('/:id/members/:userId', requirePermission(PERMISSIONS.COURSE_ASSIGN), groupController.removeMember)

// Roster changes driven from the employees table, where a selection of people
// is moved in or out at once. Separate from the two routes above because they
// answer with a summary — who was added, who was already a member, whose id no
// longer resolves — which the group page's own single-row calls do not need.
// Same permission: every membership change opens or revokes course access.
groupsRouter.post(
  '/:id/members/bulk-add',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  validateBody(groupMembersSchema),
  groupController.addMembersBulk
)
groupsRouter.post(
  '/:id/members/bulk-remove',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  validateBody(groupMembersSchema),
  groupController.removeMembersBulk
)

groupsRouter.post(
  '/:id/courses',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  validateBody(groupCoursesSchema),
  groupController.addCourses
)
groupsRouter.delete('/:id/courses/:courseId', requirePermission(PERMISSIONS.COURSE_ASSIGN), groupController.removeCourse)
