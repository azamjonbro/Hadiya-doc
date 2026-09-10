import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { publicApiService } from '../services/integrations/publicApi.service.js'

export const publicApiController = {
  /**
   * What this key is and what it may read.
   *
   * The first call an integrator makes, and the one that answers "why am I
   * getting 403s" without a support conversation.
   */
  me: asyncHandler(async (req, res) => {
    sendSuccess(res, {
      name: req.apiKey.name,
      prefix: req.apiKey.prefix,
      scopes: req.apiKey.scopes,
      includePii: req.apiKey.includePii,
      rateLimitPerMinute: req.apiKey.rateLimitPerMinute,
      expiresAt: req.apiKey.expiresAt,
    })
  }),

  users: asyncHandler(async (req, res) => {
    const query = req.validatedQuery ?? req.query
    sendSuccess(res, await publicApiService.users({ ...query, includePii: req.apiKey.includePii }))
  }),

  courses: asyncHandler(async (req, res) => {
    sendSuccess(res, await publicApiService.courses(req.validatedQuery ?? req.query))
  }),

  assignments: asyncHandler(async (req, res) => {
    sendSuccess(res, await publicApiService.assignments(req.validatedQuery ?? req.query))
  }),

  certificates: asyncHandler(async (req, res) => {
    sendSuccess(res, await publicApiService.certificates(req.validatedQuery ?? req.query))
  }),
}
