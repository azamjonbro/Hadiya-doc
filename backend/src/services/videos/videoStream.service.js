import { videoRepository } from '../../repositories/video.repository.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { streamToString } from '../../utils/streamToString.js'
import { ApiError } from '../../utils/ApiError.js'

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

async function loadReadyVideo(videoId) {
  const video = await videoRepository.findById(videoId)
  if (!video || video.processingStatus !== 'READY' || !video.hlsManifestKey) {
    throw ApiError.notFound('Video is not available for playback')
  }
  return video
}

export const videoStreamService = {
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
