import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { kbController } from '../../controllers/kb.controller.js'
import {
  createArticleSchema,
  updateArticleSchema,
  listArticlesQuerySchema,
  createKbCategorySchema,
  rateArticleSchema,
  kbCommentSchema,
} from '../../validators/kb.validator.js'

export const kbRouter = Router()

kbRouter.use(authenticate)

// Literal segments first, so 'categories' and 'analytics' are not read as
// article slugs.
kbRouter.get('/categories', kbController.listCategories)
kbRouter.post(
  '/categories',
  requirePermission(PERMISSIONS.NEWS_MANAGE),
  validateBody(createKbCategorySchema),
  kbController.createCategory
)
kbRouter.get('/analytics', requirePermission(PERMISSIONS.NEWS_MANAGE), kbController.analytics)

// Reading is open to everybody signed in; which articles they actually see
// is decided by targeting inside the service (the same rule as courses).
kbRouter.get('/', validateQuery(listArticlesQuerySchema), kbController.list)
kbRouter.post('/', requirePermission(PERMISSIONS.NEWS_MANAGE), validateBody(createArticleSchema), kbController.create)

kbRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.NEWS_MANAGE),
  validateBody(updateArticleSchema),
  kbController.update
)
kbRouter.delete('/:id', requirePermission(PERMISSIONS.NEWS_MANAGE), kbController.remove)
kbRouter.get('/:id/versions', requirePermission(PERMISSIONS.NEWS_MANAGE), kbController.versions)

kbRouter.post('/:id/rate', validateBody(rateArticleSchema), kbController.rate)
kbRouter.get('/:id/comments', kbController.comments)
kbRouter.post('/:id/comments', validateBody(kbCommentSchema), kbController.comment)
kbRouter.post(
  '/comments/:commentId/resolve',
  requirePermission(PERMISSIONS.NEWS_MANAGE),
  kbController.resolveComment
)

// Last: a slug is anything, so this must not shadow the routes above.
kbRouter.get('/:slug', kbController.getBySlug)
