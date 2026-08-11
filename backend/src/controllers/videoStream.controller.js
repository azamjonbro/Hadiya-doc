import { videoStreamService } from '../services/videos/videoStream.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const CONTENT_TYPE_BY_EXTENSION = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
}

function extensionOf(filename) {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot)
}

export const videoStreamController = {
  masterManifest: asyncHandler(async (req, res) => {
    const content = await videoStreamService.getMasterManifest(req.params.videoId, req.query.token)
    res.setHeader('Content-Type', CONTENT_TYPE_BY_EXTENSION['.m3u8'])
    res.setHeader('Cache-Control', 'no-store')
    res.send(content)
  }),

  qualityFile: asyncHandler(async (req, res) => {
    const { quality, file } = req.params
    const result = await videoStreamService.getQualityFile(
      req.params.videoId,
      quality,
      file,
      req.query.token,
      req.headers.range
    )

    if (result.isManifest) {
      res.setHeader('Content-Type', CONTENT_TYPE_BY_EXTENSION['.m3u8'])
      res.setHeader('Cache-Control', 'no-store')
      res.send(result.content)
      return
    }

    res.status(result.isPartial ? 206 : 200)
    res.setHeader('Content-Type', CONTENT_TYPE_BY_EXTENSION[extensionOf(file)] ?? 'application/octet-stream')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'no-store')
    if (result.contentLength !== undefined) res.setHeader('Content-Length', result.contentLength)
    if (result.contentRange) res.setHeader('Content-Range', result.contentRange)
    result.body.pipe(res)
  }),
}
