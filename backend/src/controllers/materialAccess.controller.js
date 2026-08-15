import { materialAccessService } from '../services/materials/materialAccess.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const materialAccessController = {
  getDownloadUrl: asyncHandler(async (req, res) => {
    const { disposition } = req.validatedQuery
    sendSuccess(res, await materialAccessService.getDownloadUrl(req.user, req.params.id, disposition))
  }),

  // Raw bytes for the in-app viewer's parsers. Never cached: the URL carries
  // no expiry of its own, so a shared cache holding the body would outlive
  // the access check that produced it.
  streamContent: asyncHandler(async (req, res) => {
    const { body, mimeType, filename, fileSize } = await materialAccessService.openStream(req.user, req.params.id)
    res.setHeader('Content-Type', mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`)
    res.setHeader('Cache-Control', 'no-store')
    if (fileSize) res.setHeader('Content-Length', fileSize)
    body.pipe(res)
  }),
}
