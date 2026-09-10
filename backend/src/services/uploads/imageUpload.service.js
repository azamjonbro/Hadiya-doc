import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'
import { mediaLibraryService } from '../media/mediaLibrary.service.js'
import { optimizeImage, makeThumbnail } from './imageOptimize.js'

// Injectable, like the other upload paths: MinIO needs Docker, which the
// dev laptops do not run, so the conversion and the registry are tested
// against a file-system stub with the same shape.
const defaultStorage = () => new S3StorageProvider(env.S3_BUCKET_IMAGES)

// Magic-byte allowlist, not the client-declared Content-Type or file
// extension — same reasoning as the video pipeline's ffprobe validation
// (spec §50 upload abuse tests), just cheaper here since images don't
// need a full codec parse to verify.
// The formats accepted on the way in. What comes *out* is always WebP
// (9.6), so this list is about what the decoder will read, not about what
// gets stored.
const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * Where a key in the images bucket can be fetched from.
 *
 * Exported because the certificate template editor has to *show* the
 * background it stored a key for, and rebuilding this in the frontend from
 * a second copy of S3_PUBLIC_URL is how the two drift apart.
 */
export function publicImageUrl(key) {
  if (!key) return ''
  return publicUrlFor(key)
}

function publicUrlFor(key) {
  if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  return `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET_IMAGES}/${key}`
}

export const imageUploadService = {
  async upload(actor, file, { storage = defaultStorage() } = {}) {
    if (!file) throw ApiError.badRequest('No file uploaded', 'FILE_REQUIRED')

    const detected = await fileTypeFromBuffer(file.buffer)
    const ext = detected && ALLOWED_MIME_TO_EXT[detected.mime]
    if (!ext) {
      throw ApiError.badRequest('File is not a supported image type (jpeg, png, webp, gif)', 'UNSUPPORTED_IMAGE_TYPE')
    }

    // Re-encoded to WebP before anything is stored (9.6). A phone
    // photograph is two to four megabytes of JPEG and a fifth of that as
    // WebP at the size it is actually displayed — felt most by an employee
    // opening the catalogue on mobile data. The re-encode is also what
    // strips EXIF: a photo of a workplace carries GPS coordinates and a
    // device name, and a course cover has no business publishing either.
    const optimized = await optimizeImage(file.buffer, { mimeType: detected.mime })
    const thumbnail = await makeThumbnail(file.buffer)

    // Server-generated key — never derived from the uploaded filename
    // (spec §36/§50 path traversal — same rule as video originals).
    const id = crypto.randomUUID()
    const key = `${actor.id}/${id}.${optimized.ext}`
    await storage.putObject(key, optimized.buffer, optimized.mimeType)

    let thumbKey = ''
    if (thumbnail) {
      thumbKey = `${actor.id}/${id}-thumb.webp`
      // Best-effort: the grid falls back to the full image, which is what
      // it used before there were thumbnails at all.
      await storage.putObject(thumbKey, thumbnail.buffer, 'image/webp').catch(() => {
        thumbKey = ''
      })
    }

    const url = publicUrlFor(key)
    // Recorded in the library (9.5) so the next author who needs this image
    // can pick it instead of uploading it again, and so the orphan sweep
    // can tell "uploaded for later" from "left behind". Best-effort by
    // design: the bytes are stored and the caller is about to reference
    // them, so a registry hiccup must not fail the upload.
    await mediaLibraryService.register(actor, {
      key,
      url,
      name: String(file.originalname ?? '').replace(/[/\\]/g, '').slice(0, 200),
      mimeType: optimized.mimeType,
      size: optimized.buffer.length,
      folder: '',
      width: optimized.width,
      height: optimized.height,
      thumbKey,
      thumbUrl: thumbKey ? publicUrlFor(thumbKey) : '',
      originalMimeType: detected.mime,
      originalSize: file.size ?? file.buffer.length,
    })

    return {
      url,
      key,
      width: optimized.width,
      height: optimized.height,
      thumbUrl: thumbKey ? publicUrlFor(thumbKey) : '',
      // What the re-encode saved, for the upload UI to say so.
      bytes: optimized.buffer.length,
      originalBytes: file.size ?? file.buffer.length,
    }
  },
}
