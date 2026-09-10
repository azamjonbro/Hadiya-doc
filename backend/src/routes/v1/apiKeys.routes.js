import { Router } from 'express'
import { ROLES } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { apiKeyController } from '../../controllers/apiKey.controller.js'
import { createApiKeySchema } from '../../validators/apiKey.validator.js'

export const apiKeysRouter = Router()

apiKeysRouter.use(authenticate)

/**
 * Managing keys stays with SUPERADMIN as a **role**, not a permission.
 *
 * A key is a standing grant of read access to the whole company that
 * outlives whoever created it, and it is not visible in any screen the way
 * a user account is. That is the same class of decision as the permanent
 * course delete, which is also role-gated for the same reason.
 */
apiKeysRouter.get('/', requireRole(ROLES.SUPERADMIN), apiKeyController.list)
apiKeysRouter.post('/', requireRole(ROLES.SUPERADMIN), validateBody(createApiKeySchema), apiKeyController.create)
apiKeysRouter.delete('/:id', requireRole(ROLES.SUPERADMIN), apiKeyController.revoke)
apiKeysRouter.get('/scopes', requireRole(ROLES.SUPERADMIN), apiKeyController.scopes)
