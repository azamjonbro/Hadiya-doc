import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { mediaLibraryService } from '../services/media/mediaLibrary.service.js'
import { sweepOrphans } from '../services/media/mediaCleanup.service.js'

export const mediaController = {
  list: asyncHandler(async (req, res) => {
    // validateQuery writes the parsed values to `validatedQuery` rather than
    // over `req.query` — so page and limit arrive as numbers only if this
    // reads from there.
    sendSuccess(res, await mediaLibraryService.list(req.validatedQuery ?? req.query))
  }),

  folders: asyncHandler(async (req, res) => {
    sendSuccess(res, await mediaLibraryService.folders())
  }),

  usage: asyncHandler(async (req, res) => {
    sendSuccess(res, await mediaLibraryService.usage(req.params.id))
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await mediaLibraryService.update(req.user, req.params.id, req.body), 'Updated')
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await mediaLibraryService.remove(req.user, req.params.id, { force: req.query.force === 'true' }),
      'Deleted'
    )
  }),

  /**
   * The orphan sweep, on demand.
   *
   * Reports unless `?apply=true`, and the route puts it behind SUPERADMIN:
   * it is the only call in the platform that can delete bytes nobody asked
   * about.
   */
  cleanup: asyncHandler(async (req, res) => {
    const apply = (req.validatedQuery ?? req.query).apply === 'true'
    const result = await sweepOrphans({ apply, actor: req.user })
    sendSuccess(res, result, result.applied ? 'Orphans deleted' : 'Report only')
  }),
}
