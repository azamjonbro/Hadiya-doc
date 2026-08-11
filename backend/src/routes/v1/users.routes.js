import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { sendSuccess } from '../../utils/apiResponse.js'
import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'

export const usersRouter = Router()

usersRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await userRepository.findById(req.user.id)
    const role = await roleRepository.findById(req.user.roleId)
    sendSuccess(res, {
      id: user._id.toString(),
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      department: user.department,
      position: user.position,
      avatar: user.avatar,
      role: role.name,
      permissions: role.permissions,
    })
  })
)
