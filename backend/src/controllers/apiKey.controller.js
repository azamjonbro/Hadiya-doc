import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { apiKeyService, GRANTABLE_SCOPES } from '../services/integrations/apiKey.service.js'

export const apiKeyController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await apiKeyService.list())
  }),

  /**
   * 201 with the key in the body — the only time it exists outside the
   * caller's own storage.
   */
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await apiKeyService.create(req.user, req.body), 'Key created — copy it now', 201)
  }),

  revoke: asyncHandler(async (req, res) => {
    sendSuccess(res, await apiKeyService.revoke(req.user, req.params.id), 'Key revoked')
  }),

  /** What may be granted, so the UI does not hardcode a second copy. */
  scopes: asyncHandler(async (req, res) => {
    sendSuccess(res, GRANTABLE_SCOPES)
  }),
}
