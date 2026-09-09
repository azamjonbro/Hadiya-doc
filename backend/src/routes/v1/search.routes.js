import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { globalSearchService } from '../../services/search/globalSearch.service.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { sendSuccess } from '../../utils/apiResponse.js'

export const searchRouter = Router()

const searchQuerySchema = z.object({
  q: z.string().trim().max(200),
  types: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : undefined)),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
})

// No permission gate on the endpoint itself: what somebody may find is
// decided per result by the same visibility functions the catalogs use
// (AT-24). A permission here would be a second, weaker answer to the same
// question.
searchRouter.use(authenticate)

searchRouter.get(
  '/',
  validateQuery(searchQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, types, limit } = req.validatedQuery
    sendSuccess(res, await globalSearchService.search(req.user, q, { types, limit }))
  })
)
