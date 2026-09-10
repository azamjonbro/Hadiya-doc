import { Video } from '../../models/video.model.js'
import { videoRepository } from '../../repositories/video.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'
import { normalizeLanguage, toWebVtt, countCues } from './subtitleFormat.js'

/**
 * Caption tracks on a video (9.4).
 *
 * Two ways one arrives: the pipeline finds it inside the uploaded file
 * (processVideo.js), or a person uploads it here. This module owns the
 * second, plus the rules that apply to both — one default at a time, one
 * track per language, and a stored file that is always WebVTT.
 *
 * Captions are not a nice-to-have on this platform: mandatory training that
 * only works with sound excludes the people who most need the text, and the
 * accessibility block (12.x) starts from the assumption that this exists.
 */
const defaultStorage = () => new S3StorageProvider(env.S3_BUCKET_PROCESSED)

// A caption file for a two-hour lecture is a few hundred kilobytes. Ten
// megabytes is far past that and still small enough to hold in memory.
const MAX_BYTES = 10 * 1024 * 1024
// A track with more cues than this is not a transcript, it is a generated
// file gone wrong (one cue per word, say).
const MAX_CUES = 20000

function toPublicTrack(track) {
  return {
    id: track._id.toString(),
    lang: track.lang,
    label: track.label,
    source: track.source,
    isDefault: track.isDefault,
    cueCount: track.cueCount,
    createdAt: track.createdAt,
  }
}

export const subtitleService = {
  list(video) {
    return (video.subtitles ?? []).map(toPublicTrack)
  },

  /**
   * Adds (or replaces) the track for one language.
   *
   * Replaces rather than appends: two tracks in the same language give the
   * viewer a menu with "Uzbek" twice and no way to tell them apart, and the
   * second upload is nearly always a correction of the first.
   */
  async add(actor, videoId, { lang, label, isDefault }, file, { storage = defaultStorage() } = {}) {
    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')
    if (!file) throw ApiError.badRequest('No file uploaded', 'FILE_REQUIRED')
    if (file.size > MAX_BYTES) throw ApiError.badRequest('Subtitle file is too large', 'FILE_TOO_LARGE')

    const language = normalizeLanguage(lang)
    if (!language) throw ApiError.badRequest('Language must look like `uz` or `ru-RU`', 'INVALID_LANGUAGE')

    // Decoded as UTF-8 with the BOM stripped by the converter. A file in a
    // legacy Windows codepage will come out as mojibake rather than being
    // rejected — detecting encodings is guesswork, and every tool that
    // exports captions today writes UTF-8.
    const { vtt, error } = toWebVtt(file.buffer.toString('utf8'))
    if (error) throw ApiError.badRequest(error, 'INVALID_SUBTITLE_FILE')

    const cueCount = countCues(vtt)
    if (cueCount > MAX_CUES) throw ApiError.badRequest('Subtitle file has too many cues', 'SUBTITLE_TOO_LONG')

    const key = `processed/${videoId}/subtitles/upload-${language}.vtt`
    await storage.putObject(key, Buffer.from(vtt, 'utf8'), 'text/vtt; charset=utf-8')

    const existing = (video.subtitles ?? []).find((track) => track.lang === language)
    const shouldBeDefault = isDefault === true || (video.subtitles ?? []).length === 0

    if (existing) {
      existing.label = label?.trim() || existing.label
      existing.key = key
      existing.source = 'UPLOAD'
      existing.cueCount = cueCount
      existing.createdAt = new Date()
      if (shouldBeDefault) existing.isDefault = true
    } else {
      video.subtitles.push({
        lang: language,
        label: label?.trim() || language,
        key,
        source: 'UPLOAD',
        isDefault: shouldBeDefault,
        cueCount,
      })
    }

    if (shouldBeDefault) {
      const chosen = existing ?? video.subtitles.at(-1)
      video.subtitles.forEach((track) => {
        track.isDefault = track === chosen
      })
    }

    await video.save()

    await auditLogRepository.record({
      actor: actor.id,
      action: 'VIDEO_SUBTITLE_ADDED',
      entity: 'Video',
      entityId: String(videoId),
      metadata: { lang: language, cueCount, replaced: Boolean(existing) },
    })

    return this.list(video)
  },

  /** Exactly one default, or none. */
  async setDefault(actor, videoId, trackId) {
    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')
    const track = video.subtitles.id(trackId)
    if (!track) throw ApiError.notFound('Subtitle track not found')

    video.subtitles.forEach((row) => {
      row.isDefault = String(row._id) === String(trackId)
    })
    await video.save()
    return this.list(video)
  },

  async remove(actor, videoId, trackId, { storage = defaultStorage() } = {}) {
    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')
    const track = video.subtitles.id(trackId)
    if (!track) throw ApiError.notFound('Subtitle track not found')

    const { key, lang, isDefault } = track
    track.deleteOne()
    // Removing the default promotes the next one rather than leaving a
    // video with captions that never come on by themselves.
    if (isDefault && video.subtitles.length) video.subtitles[0].isDefault = true
    await video.save()

    // The row is what the player reads, so the object going or staying is
    // not worth failing the request over — an orphan is 9.5's sweep.
    await storage.deleteObject(key).catch((error) => {
      logger.warn('Could not delete a subtitle object', { videoId: String(videoId), key, error: error.message })
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'VIDEO_SUBTITLE_REMOVED',
      entity: 'Video',
      entityId: String(videoId),
      metadata: { lang },
    })

    return this.list(video)
  },

  /**
   * The VTT itself, for the streaming route.
   *
   * Read by id rather than by language: two videos can have a `uz` track
   * and the id is what the player was given, so nothing has to be resolved
   * from a string the client controls.
   */
  async openTrack(videoId, trackId, { storage = defaultStorage() } = {}) {
    const video = await Video.findById(videoId, { subtitles: 1, processingStatus: 1 }).lean()
    if (!video) throw ApiError.notFound('Video not found')
    const track = (video.subtitles ?? []).find((row) => String(row._id) === String(trackId))
    if (!track) throw ApiError.notFound('Subtitle track not found')
    return { body: await storage.getObject(track.key), lang: track.lang }
  },
}
