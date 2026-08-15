import { courseAssignmentService } from '../services/courses/courseAssignment.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const courseAssignmentController = {
  assign: asyncHandler(async (req, res) => {
    const assignment = await courseAssignmentService.assign(req.user, req.params.id, req.body)
    sendSuccess(res, assignment, 'Course assigned', 201)
  }),

  enrollSelf: asyncHandler(async (req, res) => {
    const assignment = await courseAssignmentService.selfEnroll(req.user, req.params.id)
    sendSuccess(res, assignment, 'Enrolled', 201)
  }),

  listForCourse: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseAssignmentService.listForCourse(req.user, req.params.id))
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseAssignmentService.update(req.user, req.params.id, req.body), 'Assignment updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await courseAssignmentService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Assignment removed')
  }),
}
