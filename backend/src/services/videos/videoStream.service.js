import { videoRepository } from '../../repositories/video.repository.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { streamToString } from '../../utils/streamToString.js'
import { ApiError } from '../../utils/ApiError.js'
import { subtitleService } from './subtitle.service.js'

const processedStorage = new S3StorageProvider(env.S3_BUCKET_PROCESSED)

function rewriteManifest(text, token) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return line
      // Relative references only (quality/index.m3u8, segment_000.ts) —
      // never expose the underlying storage bucket URL to the client.
      return `${trimmed}?token=${token}`
    })
    .join('\n')
}

// req.params.file is attacker-controlled and feeds directly into the S3
// object key below. Express decodes %2e%2e%2f sequences into the param
// before routing sees it, so an unvalidated `file` could contain `../` and
// walk the key into a different video's prefix within the same bucket —
// the token only pins `videoId`, so nothing else would catch that. Segment
// and manifest filenames are always a flat "name.ext" with no separators,
// so anything else is rejected outright (spec §50 path traversal tests).
const SAFE_FILENAME = /^[\w.-]+$/

async function loadReadyVideo(videoId) {
  const video = await videoRepository.findById(videoId)
  if (!video || video.processingStatus !== 'READY' || !video.hlsManifestKey) {
    throw ApiError.notFound('Video is not available for playback')
  }
  return video
}

export const videoStreamService = {
  /**
   * A caption track, on the same authorisation as the segments (9.4).
   *
   * A `<track>` element carries no Authorization header — the browser
   * fetches it itself, exactly like a segment — so it rides the same
   * short-lived playback token the rest of the player uses. The video does
   * not have to be READY for this: captions are still readable while a
   * re-transcode is running, and there is nothing in a VTT that playback
   * gates protect.
   */
  async getSubtitle(videoId, trackId) {
    return subtitleService.openTrack(videoId, trackId)
  },

  async getMasterManifest(videoId, token) {
    const video = await loadReadyVideo(videoId)
    const body = await processedStorage.getObject(video.hlsManifestKey)
    const text = await streamToString(body)
    return rewriteManifest(text, token)
  },

  async getQualityFile(videoId, quality, file, token, rangeHeader) {
    const video = await loadReadyVideo(videoId)
    if (!video.qualities.includes(quality)) {
      throw ApiError.notFound('Quality rendition not found')
    }
    if (!SAFE_FILENAME.test(file)) {
      throw ApiError.badRequest('Invalid file name', 'INVALID_FILE_NAME')
    }

    const prefix = video.hlsManifestKey.replace(/master\.m3u8$/, '')
    const key = `${prefix}${quality}/${file}`

    if (file.endsWith('.m3u8')) {
      const body = await processedStorage.getObject(key)
      const text = await streamToString(body)
      return { isManifest: true, content: rewriteManifest(text, token) }
    }

    const result = await processedStorage.getObjectWithRange(key, rangeHeader)
    return { isManifest: false, ...result }
  },
}
