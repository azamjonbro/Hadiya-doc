import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { newsController } from '../../controllers/news.controller.js'
import {
  createNewsSchema,
  updateNewsSchema,
  listNewsQuerySchema,
  feedQuerySchema,
  newsCommentSchema,
  commentsModerationQuerySchema,
} from '../../validators/news.validator.js'

export const newsRouter = Router()

newsRouter.use(authenticate)
newsRouter.use(requirePermission(PERMISSIONS.NEWS_READ))

newsRouter.get('/feed', validateQuery(feedQuerySchema), newsController.feed)
newsRouter.get('/', validateQuery(listNewsQuerySchema), newsController.list)
// Literal before '/:id': the moderation list of every comment.
newsRouter.get(
  '/comments',
  requirePermission(PERMISSIONS.NEWS_MANAGE),
  validateQuery(commentsModerationQuerySchema),
  newsController.allComments
)
newsRouter.post('/', requirePermission(PERMISSIONS.NEWS_CREATE), validateBody(createNewsSchema), newsController.create)
newsRouter.get('/:id', newsController.getById)
newsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.NEWS_MANAGE),
  validateBody(updateNewsSchema),
  newsController.update
)
newsRouter.delete('/:id', requirePermission(PERMISSIONS.NEWS_MANAGE), newsController.remove)

// Reactions (portal §3). Reading news is the only gate: anyone who can see
// an article can like it or say something under it; removing someone
// else's comment is the news:manage check inside the service.
newsRouter.post('/:id/like', newsController.toggleLike)
newsRouter.get('/:id/comments', newsController.comments)
newsRouter.post('/:id/comments', validateBody(newsCommentSchema), newsController.comment)
newsRouter.delete('/:id/comments/:commentId', newsController.removeComment)
