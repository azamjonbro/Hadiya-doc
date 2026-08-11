import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { videoRepository } from '../repositories/video.repository.js'
import { S3StorageProvider } from '../storage/S3StorageProvider.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { probeVideo, transcodeToHls, extractThumbnail } from './ffmpegUtils.js'

const originalsStorage = new S3StorageProvider(env.S3_BUCKET_ORIGINALS)
const processedStorage = new S3StorageProvider(env.S3_BUCKET_PROCESSED)

// Renditions above the source's own resolution are skipped — spec §31.
const QUALITY_LADDER = [
  { name: '360p', height: 360 },
  { name: '480p', height: 480 },
  { name: '720p', height: 720 },
  { name: '1080p', height: 1080 },
]

const BANDWIDTH_BY_HEIGHT = { 360: 800_000, 480: 1_400_000, 720: 2_800_000, 1080: 5_000_000 }

async function downloadToTemp(key, destPath) {
  const readable = await originalsStorage.getObject(key)
  const writable = fsSync.createWriteStream(destPath)
  await pipeline(readable, writable)
}

async function uploadDir(localDir, remotePrefix) {
  const entries = await fs.readdir(localDir)
  for (const entry of entries) {
    const localPath = path.join(localDir, entry)
    const stat = await fs.stat(localPath)
    if (!stat.isFile()) continue

    const contentType = entry.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : entry.endsWith('.ts')
        ? 'video/mp2t'
        : 'application/octet-stream'

    const buffer = await fs.readFile(localPath)
    await processedStorage.putObject(`${remotePrefix}/${entry}`, buffer, contentType)
  }
}

function buildMasterPlaylist(qualities) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3']
  for (const q of qualities) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${BANDWIDTH_BY_HEIGHT[q.height] ?? 1_000_000},RESOLUTION=${q.width}x${q.height}`
    )
    lines.push(`${q.name}/index.m3u8`)
  }
  return `${lines.join('\n')}\n`
}

export async function processVideo(videoId) {
  const video = await videoRepository.findById(videoId)
  if (!video) {
    logger.warn('processVideo: video not found', { videoId })
    return
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lms-video-'))
  const originalPath = path.join(workDir, 'original')

  try {
    await videoRepository.updateById(videoId, { processingStatus: 'VALIDATING', processingError: '' })
    await downloadToTemp(video.originalKey, originalPath)

    const metadata = await probeVideo(originalPath)
    if (!metadata.width || !metadata.height || !metadata.durationSeconds) {
      throw new Error('Could not read video metadata — file may be corrupt or not a real video')
    }

    let qualitiesToProduce = QUALITY_LADDER.filter((q) => q.height <= metadata.height)
    if (qualitiesToProduce.length === 0) qualitiesToProduce = [QUALITY_LADDER[0]]

    await videoRepository.updateById(videoId, {
      processingStatus: 'TRANSCODING',
      duration: metadata.durationSeconds,
    })

    const producedQualities = []
    for (const quality of qualitiesToProduce) {
      const qualityDir = path.join(workDir, quality.name)
      await fs.mkdir(qualityDir, { recursive: true })
      await transcodeToHls({ inputPath: originalPath, outputDir: qualityDir, height: quality.height })
      producedQualities.push({
        ...quality,
        width: Math.round((metadata.width / metadata.height) * quality.height / 2) * 2,
      })
    }

    await videoRepository.updateById(videoId, { processingStatus: 'PACKAGING' })

    const remotePrefix = `processed/${videoId}`
    for (const quality of producedQualities) {
      await uploadDir(path.join(workDir, quality.name), `${remotePrefix}/${quality.name}`)
    }

    const masterKey = `${remotePrefix}/master.m3u8`
    await processedStorage.putObject(
      masterKey,
      Buffer.from(buildMasterPlaylist(producedQualities)),
      'application/vnd.apple.mpegurl'
    )

    const thumbnailPath = path.join(workDir, 'thumbnail.jpg')
    await extractThumbnail({
      inputPath: originalPath,
      outputPath: thumbnailPath,
      atSeconds: Math.min(1, metadata.durationSeconds / 2),
    })
    const thumbnailKey = `${remotePrefix}/thumbnail.jpg`
    await processedStorage.putObject(thumbnailKey, await fs.readFile(thumbnailPath), 'image/jpeg')

    await videoRepository.updateById(videoId, {
      processingStatus: 'READY',
      hlsManifestKey: masterKey,
      thumbnailUrl: thumbnailKey,
      posterUrl: thumbnailKey,
      qualities: producedQualities.map((q) => q.name),
      duration: metadata.durationSeconds,
      processingError: '',
    })

    logger.info('Video processing finished', { videoId, qualities: producedQualities.map((q) => q.name) })
  } catch (error) {
    logger.error('Video processing failed', { videoId, error: error.message })
    await videoRepository.updateById(videoId, {
      processingStatus: 'FAILED',
      processingError: error.message.slice(0, 500),
    })
    throw error
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
