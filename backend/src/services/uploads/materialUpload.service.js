import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'

const materialsStorage = new S3StorageProvider(env.S3_BUCKET_MATERIALS)

// Magic-byte allowlist keyed by the extension file-type resolves to (not
// raw mime strings — Ogg variants report as 'audio/ogg; codecs=opus' etc,
// so `ext` is the more stable key), same reasoning as imageUpload.service.js:
// never trust the client-declared Content-Type or filename.
//
// Deliberate v1 scope cuts:
//  - legacy .doc/.xls/.ppt (OLE2 containers, indistinguishable from each
//    other by magic bytes alone) and plain .txt/.csv (no magic number) are
//    not supported.
//  - MULTIMEDIA is audio-only — raw video already has a full tus/transcode/
//    HLS pipeline (see src/video/); accepting it here would create a second,
//    unprocessed way to serve video.
const ALLOWED_EXTS_BY_TYPE = {
  FILE: new Set(['pdf', 'docx', 'xlsx']),
  PRESENTATION: new Set(['pptx', 'pdf']),
  MULTIMEDIA: new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a']),
}

const MAX_BYTES = env.MATERIAL_MAX_FILE_SIZE_MB * 1024 * 1024

// Client-declared filename, kept for display only — the storage key below
// is always server-generated and never derived from this value, so this
// just needs to drop path separators, not fully harden against every
// control character.
function sanitizeFilename(name) {
  return String(name ?? '').replace(/[/\\]/g, '').slice(0, 255)
}

export const materialUploadService = {
  async upload(actor, type, file) {
    if (!file) throw ApiError.badRequest('No file uploaded', 'FILE_REQUIRED')
    if (file.size > MAX_BYTES) {
      throw ApiError.badRequest(`File must be ${env.MATERIAL_MAX_FILE_SIZE_MB}MB or smaller`, 'FILE_TOO_LARGE')
    }

    const allowedExts = ALLOWED_EXTS_BY_TYPE[type]
    if (!allowedExts) throw ApiError.badRequest('Unsupported material type', 'UNSUPPORTED_MATERIAL_TYPE')

    const detected = await fileTypeFromBuffer(file.buffer)
    if (!detected || !allowedExts.has(detected.ext)) {
      throw ApiError.badRequest(
        `File is not a supported ${type.toLowerCase()} type (${[...allowedExts].join(', ')})`,
        'UNSUPPORTED_FILE_TYPE'
      )
    }

    // Server-generated key — never derived from the uploaded filename
    // (path traversal rule, same as images/videos).
    const key = `${actor.id}/${type.toLowerCase()}/${crypto.randomUUID()}.${detected.ext}`
    await materialsStorage.putObject(key, file.buffer, detected.mime)

    return {
      key,
      mimeType: detected.mime,
      fileSize: file.size,
      originalFilename: sanitizeFilename(file.originalname),
    }
  },
}
