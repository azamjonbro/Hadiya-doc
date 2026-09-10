import { competencyService } from '../services/competencies/competency.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'

/**
 * `req.scopedUserIds` is put on the request by `scopeToManagedUsers` and is
 * `null` for an unfenced caller. Every handler that reads about *other*
 * people goes through one of these two lines, so "does this endpoint apply
 * scope" is answerable by reading the handler.
 */
function assertReadable(req, userId) {
  if (req.scopedUserIds && !req.scopedUserIds.includes(String(userId))) {
    // Not 403: a manager should not be able to probe who exists outside
    // their department by watching which ids answer differently.
    throw ApiError.notFound('User not found')
  }
}

export const competencyController = {
  list: asyncHandler(async (req, res) => {
    const items = await competencyService.list(req.user, req.validatedQuery ?? {})
    sendSuccess(res, { items })
  }),

  getOne: asyncHandler(async (req, res) => {
    sendSuccess(res, await competencyService.getById(req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await competencyService.create(req.user, req.body), 'Competency created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await competencyService.update(req.user, req.params.id, req.body))
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await competencyService.remove(req.user, req.params.id))
  }),

  /** One person against the whole catalogue — what is required, what they hold. */
  forUser: asyncHandler(async (req, res) => {
    assertReadable(req, req.params.userId)
    sendSuccess(res, await competencyService.forUser(req.params.userId))
  }),

  /** The signed-in person's own levels. No permission beyond being signed in. */
  mine: asyncHandler(async (req, res) => {
    sendSuccess(res, await competencyService.forUser(req.user.id))
  }),

  /**
   * Record a level. The scope check is the service's — it has to hold for
   * every caller, not only for the ones that arrive through this route.
   */
  assess: asyncHandler(async (req, res) => {
    sendSuccess(res, await competencyService.assess(req.user, req.body), 'Assessment recorded', 201)
  }),

  /** People × competencies, with the gap on every cell. */
  matrix: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await competencyService.matrix({ ...(req.validatedQuery ?? {}), scopedUserIds: req.scopedUserIds ?? null })
    )
  }),
}
