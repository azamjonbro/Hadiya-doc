import { roleService } from '../services/roles/role.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const roleController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.list())
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.create(req.user, req.body.name), 'Role created', 201)
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.remove(req.user, req.params.id), 'Role deleted')
  }),
}
