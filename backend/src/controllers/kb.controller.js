import { kbService } from '../services/kb/kb.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const kbController = {
  listCategories: asyncHandler(async (_req, res) => {
    sendSuccess(res, await kbService.listCategories())
  }),
  createCategory: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.createCategory(req.user, req.body), 'Category created', 201)
  }),

  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.list(req.user, req.validatedQuery))
  }),
  getBySlug: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.getBySlug(req.user, req.params.slug))
  }),
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.create(req.user, req.body), 'Article created', 201)
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.update(req.user, req.params.id, req.body))
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.remove(req.user, req.params.id), 'Article deleted')
  }),
  versions: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.versions(req.params.id))
  }),

  rate: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.rate(req.user, req.params.id, req.body.helpful))
  }),
  comments: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.comments(req.params.id))
  }),
  comment: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.comment(req.user, req.params.id, req.body), 'Comment added', 201)
  }),
  resolveComment: asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.resolveComment(req.user, req.params.commentId))
  }),

  analytics: asyncHandler(async (_req, res) => {
    sendSuccess(res, await kbService.analytics())
  }),
}
