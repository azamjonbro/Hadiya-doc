import { projectService } from '../services/projects/project.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const projectController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, { items: await projectService.list(req.user) })
  }),

  candidates: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.candidates(req.user, req.validatedQuery))
  }),

  get: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.getById(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.create(req.user, req.body), 'Project created', 201)
  }),

  rename: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.rename(req.user, req.params.id, req.body.name), 'Project renamed')
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.remove(req.user, req.params.id), 'Project deleted')
  }),

  addMembers: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.addMembers(req.user, req.params.id, req.body), 'Members added')
  }),

  setMemberAccess: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await projectService.setMemberAccess(req.user, req.params.id, req.params.userId, req.body.access),
      'Access updated'
    )
  }),

  removeMember: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.removeMember(req.user, req.params.id, req.params.userId), 'Member removed')
  }),
}
