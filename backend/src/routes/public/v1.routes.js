import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { apiKeyAuth, apiKeyRateLimit } from '../../middlewares/apiKeyAuth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { publicApiController } from '../../controllers/publicApi.controller.js'
import {
  publicUsersSchema,
  publicCoursesSchema,
  publicAssignmentsSchema,
  publicCertificatesSchema,
} from '../../validators/publicApi.validator.js'

/**
 * `/api/public/v1` — the integration surface (11.1).
 *
 * Separate from `/api/v1` on purpose, and not just for tidiness:
 *
 *   - **Different door.** Every route here authenticates with an API key
 *     and nothing else. A session token does not work here, and a key does
 *     not work on the private API (it is not a JWT). Neither audience can
 *     stumble into the other's endpoints.
 *   - **Different contract.** The private API's payloads follow the SPA and
 *     change with it. These are versioned in the path and shaped for
 *     another system to read (publicApi.service.js), so a redesigned screen
 *     cannot break somebody's nightly sync.
 *   - **Read-only.** Enrolling people or deleting a course through a key is
 *     a different product with a different review; every write path in the
 *     platform has a person's authority behind it.
 *
 * Authorisation is the *same* `requirePermission` the private routes use,
 * reading the key's scopes off `req.user.permissions` — one implementation
 * of "may this caller do that" (see apiKeyAuth.middleware.js).
 */
export const publicV1Router = Router()

publicV1Router.use(apiKeyAuth, apiKeyRateLimit)

publicV1Router.get('/me', publicApiController.me)

publicV1Router.get(
  '/users',
  requirePermission(PERMISSIONS.USER_READ),
  validateQuery(publicUsersSchema),
  publicApiController.users
)
publicV1Router.get(
  '/courses',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateQuery(publicCoursesSchema),
  publicApiController.courses
)
// Who is on what, and how far — the HR feed. `analytics:view:all` because
// it is everybody's progress, not the caller's own.
publicV1Router.get(
  '/assignments',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  validateQuery(publicAssignmentsSchema),
  publicApiController.assignments
)
publicV1Router.get(
  '/certificates',
  requirePermission(PERMISSIONS.CERTIFICATE_READ_ALL),
  validateQuery(publicCertificatesSchema),
  publicApiController.certificates
)
