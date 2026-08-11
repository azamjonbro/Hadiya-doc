import { userService } from '../services/users/user.service.js'
import { courseAssignmentService } from '../services/courses/courseAssignment.service.js'
import { userRepository } from '../repositories/user.repository.js'
import { roleRepository } from '../repositories/role.repository.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const userController = {
  me: asyncHandler(async (req, res) => {
    const user = await userRepository.findById(req.user.id)
    const role = await roleRepository.findById(req.user.roleId)
    sendSuccess(res, {
      id: user._id.toString(),
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phone: user.phone,
      department: user.department,
      position: user.position,
      avatar: user.avatar,
      role: role.name,
      permissions: role.permissions,
    })
  }),

  list: asyncHandler(async (req, res) => {
    const result = await userService.list(req.user, req.validatedQuery)
    sendSuccess(res, result)
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

  deactivate: asyncHandler(async (req, res) => {
    const user = await userService.deactivate(req.user, req.params.id)
    sendSuccess(res, user, 'User deactivated')
  }),

  getCourses: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseAssignmentService.listForUser(req.user, req.params.id))
  }),
}
