import { userService } from '../services/users/user.service.js'
import { userDeletionService } from '../services/users/userDeletion.service.js'
import { courseAssignmentService } from '../services/courses/courseAssignment.service.js'
import { learningStatsService } from '../services/analytics/learningStats.service.js'
import { learningHistoryService } from '../services/analytics/learningHistory.service.js'
import { employeeInsightsService } from '../services/analytics/employeeInsights.service.js'
import { userRepository } from '../repositories/user.repository.js'
import { roleRepository } from '../repositories/role.repository.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'
import { resolveRoleScope } from '@lms/shared'

export const userController = {
  me: asyncHandler(async (req, res) => {
    const user = await userRepository.findById(req.user.id)
    const role = user ? await roleRepository.effectiveFor(user) : null
    // The access token outlives the account by up to its TTL, so a user
    // deactivated (or a role deleted) mid-session still arrives here with a
    // structurally valid token. Answer 401 so the client clears the session
    // and sends them back to login, rather than dereferencing null and
    // returning a 500 the frontend reads as "the server is broken".
    if (!user || !user.isActive || !role) {
      throw ApiError.unauthorized('Account is no longer active', 'ACCOUNT_INACTIVE')
    }
    sendSuccess(res, {
      id: user._id.toString(),
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      patronymic: user.patronymic ?? '',
      fullName: user.fullName,
      jshshir: user.jshshir,
      email: user.email ?? '',
      phone: user.phone,
      department: user.department,
      position: user.position,
      avatar: user.avatar,
      role: role.name,
      roles: role.names ?? [role.name],
      permissions: role.permissions,
      // The SPA routes on this: a scoped user landing on the company
      // dashboard is sent to their team's instead of collecting a 403.
      scope: resolveRoleScope(role),
      locale: user.locale ?? 'uz',
    })
  }),

  notificationPrefs: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.getNotificationPrefs(req.user))
  }),

  updateNotificationPrefs: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.updateNotificationPrefs(req.user, req.body))
  }),

  updateLocale: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.updateLocale(req.user, req.body.locale))
  }),

  list: asyncHandler(async (req, res) => {
    const result = await userService.list(req.user, req.validatedQuery)
    sendSuccess(res, result)
  }),

  listDepartments: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.listDepartments(req.user))
  }),

  listBranches: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.listBranches(req.user))
  }),

  branchOverview: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.branchOverview(req.user))
  }),

  listPositions: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.listPositions(req.user))
  }),

  getById: asyncHandler(async (req, res) => {
    const user = await userService.getById(req.user, req.params.id)
    sendSuccess(res, user)
  }),

  create: asyncHandler(async (req, res) => {
    const user = await userService.create(req.user, req.body)
    sendSuccess(res, user, 'User created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    const user = await userService.update(req.user, req.params.id, req.body)
    sendSuccess(res, user, 'User updated')
  }),

  bulkMessage: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.bulkMessage(req.user, req.body), 'Messages sent')
  }),

  bulkDepartment: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.bulkDepartment(req.user, req.body.userIds, req.body.department), 'Department changed')
  }),

  bulkDismiss: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.bulkDismiss(req.user, req.body.userIds), 'Users dismissed')
  }),

  bulkDelete: asyncHandler(async (req, res) => {
    sendSuccess(res, await userDeletionService.bulkDelete(req.user, req.body.userIds), 'Users deleted')
  }),

  permanentlyDelete: asyncHandler(async (req, res) => {
    sendSuccess(res, await userDeletionService.permanentlyDelete(req.user, req.params.id), 'User deleted')
  }),

  bulkDeactivate: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.bulkDeactivate(req.user, req.body.userIds), 'Users deactivated')
  }),

  deactivate: asyncHandler(async (req, res) => {
    const user = await userService.deactivate(req.user, req.params.id)
    sendSuccess(res, user, 'User deactivated')
  }),

  getCourses: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseAssignmentService.listForUser(req.user, req.params.id))
  }),

  getLearningStats: asyncHandler(async (req, res) => {
    sendSuccess(res, await learningStatsService.getForUser(req.params.id))
  }),

  getLearningHistory: asyncHandler(async (req, res) => {
    sendSuccess(res, await learningHistoryService.getForUser(req.params.id, req.validatedQuery))
  }),

  getPerformance: asyncHandler(async (req, res) => {
    sendSuccess(res, await employeeInsightsService.getPerformance(req.user, req.params.id))
  }),

  getActivity: asyncHandler(async (req, res) => {
    sendSuccess(res, await employeeInsightsService.getActivity(req.user, req.params.id, req.validatedQuery))
  }),

  getTestResults: asyncHandler(async (req, res) => {
    sendSuccess(res, await employeeInsightsService.getTestResults(req.user, req.params.id))
  }),

  getTasks: asyncHandler(async (req, res) => {
    sendSuccess(res, await employeeInsightsService.getTasks(req.user, req.params.id))
  }),
}
