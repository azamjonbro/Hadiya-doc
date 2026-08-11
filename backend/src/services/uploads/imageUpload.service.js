import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'

const imagesStorage = new S3StorageProvider(env.S3_BUCKET_IMAGES)

// Magic-byte allowlist, not the client-declared Content-Type or file
// extension — same reasoning as the video pipeline's ffprobe validation
// (spec §50 upload abuse tests), just cheaper here since images don't
// need a full codec parse to verify.
const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function publicUrlFor(key) {
  if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  return `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET_IMAGES}/${key}`
}

export const imageUploadService = {
  async upload(actor, file) {
    if (!file) throw ApiError.badRequest('No file uploaded', 'FILE_REQUIRED')

    const detected = await fileTypeFromBuffer(file.buffer)
    const ext = detected && ALLOWED_MIME_TO_EXT[detected.mime]
    if (!ext) {
      throw ApiError.badRequest('File is not a supported image type (jpeg, png, webp, gif)', 'UNSUPPORTED_IMAGE_TYPE')
    }

    // Server-generated key — never derived from the uploaded filename
    // (spec §36/§50 path traversal — same rule as video originals).
    const key = `${actor.id}/${crypto.randomUUID()}.${ext}`
    await imagesStorage.putObject(key, file.buffer, detected.mime)

    return { url: publicUrlFor(key), key }
  },
}
