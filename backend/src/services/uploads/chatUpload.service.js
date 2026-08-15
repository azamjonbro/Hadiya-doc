import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'

const chatStorage = new S3StorageProvider(env.S3_BUCKET_CHAT)

// Magic-byte allowlist keyed by the extension `file-type` resolves to —
// same rule as imageUpload/materialUpload: never trust the client-declared
// Content-Type or filename.
//
// VOICE covers what the browsers actually produce from MediaRecorder:
// Chrome/Firefox emit Opus in a WebM container (detected as `webm`),
// Safari emits AAC in an MP4 container (`m4a`/`mp4`). The rest are there so
// a user can also attach an existing recording.
const ALLOWED_EXTS_BY_KIND = {
  IMAGE: new Set(['jpg', 'png', 'webp', 'gif']),
  VOICE: new Set(['webm', 'ogg', 'oga', 'opus', 'mp3', 'm4a', 'mp4', 'wav']),
  FILE: new Set(['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'jpg', 'png', 'webp', 'gif']),
}

const MAX_BYTES = env.CHAT_MAX_FILE_SIZE_MB * 1024 * 1024

// Display-only; the storage key below is always server-generated, so this
// just has to drop path separators, not harden against every odd byte.
function sanitizeFilename(name) {
  return String(name ?? '').replace(/[/\\]/g, '').slice(0, 255)
}

export const chatUploadService = {
  async upload(actor, kind, file) {
    if (!file) throw ApiError.badRequest('No file uploaded', 'FILE_REQUIRED')
    if (file.size > MAX_BYTES) {
      throw ApiError.badRequest(`File must be ${env.CHAT_MAX_FILE_SIZE_MB}MB or smaller`, 'FILE_TOO_LARGE')
    }

    const allowedExts = ALLOWED_EXTS_BY_KIND[kind]
    if (!allowedExts) throw ApiError.badRequest('Unsupported attachment kind', 'UNSUPPORTED_ATTACHMENT_KIND')

    const detected = await fileTypeFromBuffer(file.buffer)
    if (!detected || !allowedExts.has(detected.ext)) {
      throw ApiError.badRequest(
        `File is not a supported ${kind.toLowerCase()} type (${[...allowedExts].join(', ')})`,
        'UNSUPPORTED_FILE_TYPE'
      )
    }

    // Server-generated key — never derived from the uploaded filename
    // (path traversal rule, same as images/materials/videos).
    const key = `${actor.id}/${kind.toLowerCase()}/${crypto.randomUUID()}.${detected.ext}`
    await chatStorage.putObject(key, file.buffer, detected.mime)

    return {
      key,
      mimeType: detected.mime,
      size: file.size,
      originalFilename: sanitizeFilename(file.originalname),
    }
  },

  // Chat attachments live in a private bucket, so every render goes through
  // a short-lived signed URL rather than a permanent public link — a URL
  // copied out of the DOM stops working within the TTL.
  signedUrl(key, { filename } = {}) {
    return chatStorage.getSignedUrl(key, env.CHAT_ATTACHMENT_URL_TTL, filename)
  },
}
