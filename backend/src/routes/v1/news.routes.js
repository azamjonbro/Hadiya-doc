import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { newsController } from '../../controllers/news.controller.js'
import { createNewsSchema, updateNewsSchema, listNewsQuerySchema, feedQuerySchema } from '../../validators/news.validator.js'

export const newsRouter = Router()

newsRouter.use(authenticate)
newsRouter.use(requirePermission(PERMISSIONS.NEWS_READ))

newsRouter.get('/feed', validateQuery(feedQuerySchema), newsController.feed)
newsRouter.get('/', validateQuery(listNewsQuerySchema), newsController.list)
newsRouter.post('/', requirePermission(PERMISSIONS.NEWS_CREATE), validateBody(createNewsSchema), newsController.create)
newsRouter.get('/:id', newsController.getById)
newsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.NEWS_MANAGE),
  validateBody(updateNewsSchema),
  newsController.update
)
newsRouter.delete('/:id', requirePermission(PERMISSIONS.NEWS_MANAGE), newsController.remove)
