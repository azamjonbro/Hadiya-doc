import { roleService } from '../services/roles/role.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const roleController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.list())
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.create(req.user, req.body.name, req.body.scope), 'Role created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.update(req.user, req.params.id, req.body), 'Role updated')
  }),

  // The catalogue the permission grid renders its columns from. Grouped by
  // module so the grid can section it, rather than 29 flat checkboxes.
  permissions: asyncHandler(async (_req, res) => {
    sendSuccess(res, await roleService.listPermissions())
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.remove(req.user, req.params.id), 'Role deleted')
  }),
}
