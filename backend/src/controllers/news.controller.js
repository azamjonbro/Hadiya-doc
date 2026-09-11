import { newsService } from '../services/news/news.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const newsController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.list(req.validatedQuery))
  }),

  feed: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.feed(req.user, req.validatedQuery))
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.getById(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.create(req.user, req.body), 'News created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.update(req.user, req.params.id, req.body), 'News updated')
  }),

  toggleLike: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.toggleLike(req.user, req.params.id))
  }),

  allComments: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.allComments(req.validatedQuery))
  }),

  comments: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.comments(req.user, req.params.id))
  }),

  comment: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsService.comment(req.user, req.params.id, req.body), 'Comment added', 201)
  }),

  removeComment: asyncHandler(async (req, res) => {
    await newsService.removeComment(req.user, req.params.id, req.params.commentId)
    sendSuccess(res, null, 'Comment deleted')
  }),

  remove: asyncHandler(async (req, res) => {
    await newsService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'News deleted')
  }),
}
