import { review360Service } from '../services/review360/review360.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const review360Controller = {
  /* ---------------- templates ---------------- */

  listTemplates: asyncHandler(async (req, res) => {
    const items = await review360Service.listTemplates(req.validatedQuery ?? {})
    sendSuccess(res, { items })
  }),

  getTemplate: asyncHandler(async (req, res) => {
    sendSuccess(res, { template: await review360Service.getTemplate(req.params.id) })
  }),

  createTemplate: asyncHandler(async (req, res) => {
    const template = await review360Service.createTemplate(req.user, req.body)
    sendSuccess(res, { template }, 'Template created', 201)
  }),

  updateTemplate: asyncHandler(async (req, res) => {
    sendSuccess(res, { template: await review360Service.updateTemplate(req.user, req.params.id, req.body) })
  }),

  deleteTemplate: asyncHandler(async (req, res) => {
    sendSuccess(res, await review360Service.removeTemplate(req.user, req.params.id))
  }),

  /* ---------------- cycles ---------------- */

  listCycles: asyncHandler(async (req, res) => {
    const items = await review360Service.listCycles({
      ...(req.validatedQuery ?? {}),
      // `req.scopedUserIds` is null for an unfenced caller and an array —
      // possibly empty — for everyone else. Passing it straight through is
      // what keeps "did this endpoint apply scope" answerable in one line.
      scopedUserIds: req.scopedUserIds ?? null,
    })
    sendSuccess(res, { items })
  }),

  getCycle: asyncHandler(async (req, res) => {
    const cycle = await review360Service.getCycle(req.params.id, { scopedUserIds: req.scopedUserIds ?? null })
    sendSuccess(res, { cycle })
  }),

  createCycle: asyncHandler(async (req, res) => {
    const cycle = await review360Service.createCycle(req.user, req.body)
    sendSuccess(res, { cycle }, 'Cycle created', 201)
  }),

  updateCycle: asyncHandler(async (req, res) => {
    sendSuccess(res, { cycle: await review360Service.updateCycle(req.user, req.params.id, req.body) })
  }),

  deleteCycle: asyncHandler(async (req, res) => {
    sendSuccess(res, await review360Service.removeCycle(req.user, req.params.id))
  }),

  previewRaters: asyncHandler(async (req, res) => {
    sendSuccess(res, await review360Service.previewRaters(req.params.id))
  }),

  launchCycle: asyncHandler(async (req, res) => {
    const cycle = await review360Service.launch(req.user, req.params.id)
    sendSuccess(res, { cycle }, 'Cycle launched')
  }),

  closeCycle: asyncHandler(async (req, res) => {
    const cycle = await review360Service.close(req.user, req.params.id)
    sendSuccess(res, { cycle }, 'Cycle closed')
  }),

  progress: asyncHandler(async (req, res) => {
    sendSuccess(res, await review360Service.progress(req.params.id, { scopedUserIds: req.scopedUserIds ?? null }))
  }),

  results: asyncHandler(async (req, res) => {
    const results = await review360Service.results(req.user, req.params.id, req.params.subjectId, {
      scopedUserIds: req.scopedUserIds ?? null,
    })
    sendSuccess(res, results)
  }),

  /* ---------------- responding ---------------- */

  mine: asyncHandler(async (req, res) => {
    const items = await review360Service.myAssignments(req.user.id, req.validatedQuery ?? {})
    sendSuccess(res, { items })
  }),

  getAssignment: asyncHandler(async (req, res) => {
    sendSuccess(res, { assignment: await review360Service.getAssignment(req.user, req.params.id) })
  }),

  respond: asyncHandler(async (req, res) => {
    const result = await review360Service.submit(req.user, req.params.id, req.body)
    sendSuccess(res, result, 'Response submitted', 201)
  }),
}
