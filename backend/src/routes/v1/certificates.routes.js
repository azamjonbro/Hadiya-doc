import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { publicCertificateRateLimiter } from '../../middlewares/certificateRateLimit.middleware.js'
import { certificateController } from '../../controllers/certificate.controller.js'
import {
  certificateListQuerySchema,
  certificateRevokeSchema,
  certificateTemplateCreateSchema,
  certificateTemplateUpdateSchema,
} from '../../validators/certificate.validator.js'

/**
 * The public verification endpoint, kept in its own router so it can be
 * mounted outside the authenticated tree.
 *
 * Its whole purpose is to be usable by somebody holding a printout and no
 * account, so `authenticate` must not run on it — and the only way to be
 * sure of that is for it not to be on a router that mounts `authenticate`
 * at all. The rate limiter is what stands in for a login here.
 */
export const publicCertificatesRouter = Router()

publicCertificatesRouter.get('/:serial', publicCertificateRateLimiter, certificateController.verify)

export const certificatesRouter = Router()

certificatesRouter.use(authenticate)

// Own certificates need no permission beyond being signed in — read:own is
// on every role, and a learner asking for their own list is not an
// administrative act.
certificatesRouter.get('/mine', certificateController.listMine)

// Templates before /:id/... so "templates" is never read as an id.
certificatesRouter.get(
  '/templates',
  requirePermission(PERMISSIONS.CERTIFICATE_TEMPLATE_MANAGE),
  certificateController.listTemplates
)
certificatesRouter.post(
  '/templates',
  requirePermission(PERMISSIONS.CERTIFICATE_TEMPLATE_MANAGE),
  validateBody(certificateTemplateCreateSchema),
  certificateController.createTemplate
)
certificatesRouter.patch(
  '/templates/:id',
  requirePermission(PERMISSIONS.CERTIFICATE_TEMPLATE_MANAGE),
  validateBody(certificateTemplateUpdateSchema),
  certificateController.updateTemplate
)
certificatesRouter.delete(
  '/templates/:id',
  requirePermission(PERMISSIONS.CERTIFICATE_TEMPLATE_MANAGE),
  certificateController.deleteTemplate
)

certificatesRouter.get(
  '/',
  requirePermission(PERMISSIONS.CERTIFICATE_READ_ALL),
  scopeToManagedUsers,
  validateQuery(certificateListQuerySchema),
  certificateController.list
)

certificatesRouter.post(
  '/:id/revoke',
  requirePermission(PERMISSIONS.CERTIFICATE_REVOKE),
  validateBody(certificateRevokeSchema),
  certificateController.revoke
)

// Scope runs here too: the handler allows an owner through unconditionally
// and everybody else only within their allow-list, so the middleware has to
// have put one on the request.
certificatesRouter.get('/:id/download', scopeToManagedUsers, certificateController.download)
