import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { videoRepository } from '../repositories/video.repository.js'
import { S3StorageProvider } from '../storage/S3StorageProvider.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { probeVideo, transcodeToHls, extractThumbnail, extractSubtitleTrack, isConvertibleSubtitle } from './ffmpegUtils.js'
import { countCues } from '../services/videos/subtitleFormat.js'

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
    if (qualitiesToProduce.length === 0) {
      // Source is shorter than even the smallest ladder rung (360p) —
      // transcode at its own native height instead of upscaling, which
      // would violate the "never exceed source resolution" rule (spec §31).
      const nativeHeight = Math.round(metadata.height / 2) * 2
      qualitiesToProduce = [{ name: `${nativeHeight}p`, height: nativeHeight }]
    }

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

    // Captions that came inside the file (9.4).
    //
    // Extracted after the renditions rather than before, so a broken
    // subtitle stream cannot cost the video its transcode — the pipeline
    // has already done the expensive part by here, and a caption failure
    // is logged and dropped rather than raised.
    const subtitles = []
    for (const stream of metadata.subtitleStreams ?? []) {
      if (!isConvertibleSubtitle(stream.codec)) {
        logger.info('Skipped a bitmap subtitle stream — it would need OCR', {
          videoId,
          codec: stream.codec,
        })
        continue
      }
      // `und` is what a container says when nobody set a language. Kept as
      // a real value rather than guessed at: an author can rename the
      // track, and mislabelling Uzbek as Russian is worse than "unknown".
      const lang = (stream.language || 'und').toLowerCase().slice(0, 8)
      const vttPath = path.join(workDir, `sub-${stream.subtitleIndex}.vtt`)
      try {
        await extractSubtitleTrack({ inputPath: originalPath, subtitleIndex: stream.subtitleIndex, outputPath: vttPath })
        const body = await fs.readFile(vttPath)
        const cueCount = countCues(body.toString())
        if (!cueCount) {
          logger.info('Skipped an empty embedded subtitle track', { videoId, lang })
          continue
        }
        const key = `${remotePrefix}/subtitles/${stream.subtitleIndex}-${lang}.vtt`
        await processedStorage.putObject(key, body, 'text/vtt; charset=utf-8')
        subtitles.push({
          lang,
          label: stream.title || '',
          key,
          source: 'EMBEDDED',
          // The first embedded track shows by default; a video with
          // captions nobody has to find is the point of doing this at all.
          isDefault: subtitles.length === 0,
          cueCount,
        })
      } catch (error) {
        logger.warn('Could not extract an embedded subtitle track', {
          videoId,
          subtitleIndex: stream.subtitleIndex,
          error: error.message,
        })
      }
    }

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
      // Only when the file had some: a re-process of a video whose
      // captions were uploaded by hand must not wipe them.
      ...(subtitles.length ? { subtitles } : {}),
    })

    logger.info('Video processing finished', {
      videoId,
      qualities: producedQualities.map((q) => q.name),
      subtitles: subtitles.length,
    })
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
