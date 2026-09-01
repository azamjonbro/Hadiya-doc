import { groupService } from '../services/groups/group.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const groupController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.list(req.user, req.validatedQuery))
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.getById(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.create(req.user, req.body), 'Group created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.update(req.user, req.params.id, req.body), 'Group updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await groupService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Group deleted')
  }),

  addMembers: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.addMembers(req.user, req.params.id, req.body.userIds))
  }),

  addMembersBulk: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.addMembersBulk(req.user, req.params.id, req.body.userIds))
  }),

  removeMembersBulk: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.removeMembersBulk(req.user, req.params.id, req.body.userIds))
  }),

  removeMember: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.removeMember(req.user, req.params.id, req.params.userId))
  }),

  addCourses: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.addCourses(req.user, req.params.id, req.body.courseIds))
  }),

  removeCourse: asyncHandler(async (req, res) => {
    sendSuccess(res, await groupService.removeCourse(req.user, req.params.id, req.params.courseId))
  }),
}
