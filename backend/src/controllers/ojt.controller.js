import { ojtService } from '../services/ojt/ojt.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const ojtController = {
  listChecklists: asyncHandler(async (req, res) => {
    const items = await ojtService.listChecklists(req.user, req.validatedQuery ?? {})
    sendSuccess(res, { items })
  }),

  getChecklist: asyncHandler(async (req, res) => {
    sendSuccess(res, { checklist: await ojtService.getChecklist(req.params.id) })
  }),

  createChecklist: asyncHandler(async (req, res) => {
    const checklist = await ojtService.createChecklist(req.user, req.body)
    sendSuccess(res, { checklist }, 'Checklist created', 201)
  }),

  updateChecklist: asyncHandler(async (req, res) => {
    sendSuccess(res, { checklist: await ojtService.updateChecklist(req.user, req.params.id, req.body) })
  }),

  removeChecklist: asyncHandler(async (req, res) => {
    sendSuccess(res, await ojtService.removeChecklist(req.user, req.params.id))
  }),

  listSessions: asyncHandler(async (req, res) => {
    // `req.scopedUserIds` is the caller's fence, put there by
    // scopeToManagedUsers; null means no fence. The service applies it —
    // passed rather than read there so "did this endpoint apply scope" is
    // answerable by reading this line.
    const result = await ojtService.listSessions(req.user, {
      ...(req.validatedQuery ?? {}),
      scopedUserIds: req.scopedUserIds ?? null,
    })
    sendSuccess(res, result)
  }),

  getSession: asyncHandler(async (req, res) => {
    const session = await ojtService.getSession(req.user, req.params.id, {
      scopedUserIds: req.scopedUserIds ?? null,
    })
    sendSuccess(res, { session })
  }),

  createSession: asyncHandler(async (req, res) => {
    const session = await ojtService.createSession(req.user, req.body)
    sendSuccess(res, { session }, 'Session scheduled', 201)
  }),

  startSession: asyncHandler(async (req, res) => {
    sendSuccess(res, { session: await ojtService.startSession(req.user, req.params.id) }, 'Session started')
  }),

  recordObservation: asyncHandler(async (req, res) => {
    const result = await ojtService.recordObservation(req.user, req.params.id, req.params.itemId, req.body)
    sendSuccess(res, result, 'Observation recorded')
  }),

  completeSession: asyncHandler(async (req, res) => {
    sendSuccess(res, { session: await ojtService.completeSession(req.user, req.params.id, req.body) }, 'Session completed')
  }),

  signOff: asyncHandler(async (req, res) => {
    sendSuccess(res, { session: await ojtService.signOff(req.user, req.params.id, req.body) }, 'Session signed off')
  }),

  cancelSession: asyncHandler(async (req, res) => {
    sendSuccess(res, { session: await ojtService.cancelSession(req.user, req.params.id, req.body) }, 'Session cancelled')
  }),
}
