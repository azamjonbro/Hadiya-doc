import { attentionPolicyService } from '../services/courses/attentionPolicy.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const attentionPolicyController = {
  getGlobal: asyncHandler(async (req, res) => {
    sendSuccess(res, await attentionPolicyService.getGlobal())
  }),

  updateGlobal: asyncHandler(async (req, res) => {
    sendSuccess(res, await attentionPolicyService.updateGlobal(req.user, req.body), 'Attention policy updated')
  }),

  getForCourse: asyncHandler(async (req, res) => {
    sendSuccess(res, await attentionPolicyService.getForCourse(req.params.id))
  }),

  // What the player actually enforces — the merged answer, with none of the
  // admin-facing "where did this value come from" detail.
  getEffectiveForCourse: asyncHandler(async (req, res) => {
    sendSuccess(res, await attentionPolicyService.getEffectiveForCourse(req.params.id))
  }),

  updateForCourse: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await attentionPolicyService.updateForCourse(req.user, req.params.id, req.body),
      'Attention policy updated'
    )
  }),

  removeCourseOverride: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await attentionPolicyService.removeCourseOverride(req.user, req.params.id),
      'Attention policy reset to global'
    )
  }),
}
