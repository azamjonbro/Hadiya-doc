import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '../config/storage.js'

/**
 * StorageProvider shape (see docs/video-streaming.md):
 *   putObject(key, body, contentType)
 *   getObject(key) -> Readable
 *   getSignedUrl(key, expiresInSeconds, responseFilename?, { disposition?, contentType? }) -> string
 *   deleteObject(key)
 *   headObject(key) -> { size, contentType }
 *
 * S3-compatible only for now (MinIO in dev, swappable for R2/AWS S3 via
 * env vars alone). A LocalStorageProvider implementing the same shape can
 * be added later for environments without S3-compatible storage — nothing
 * outside this file would need to change.
 */
export class S3StorageProvider {
  constructor(bucket) {
    this.bucket = bucket
  }

  async putObject(key, body, contentType) {
    await s3Client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType })
    )
  }

  async getObject(key) {
    const result = await s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return result.Body
  }

  async getObjectWithRange(key, rangeHeader) {
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(rangeHeader ? { Range: rangeHeader } : {}) })
    )
    return {
      body: result.Body,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      contentRange: result.ContentRange,
      isPartial: Boolean(result.ContentRange),
    }
  }

  // responseFilename is optional — when set, the browser saves the download
  // as this name instead of the opaque storage key's basename (e.g.
  // "Syllabus.pdf" instead of a UUID).
  //
  // `disposition: 'inline'` is what the in-app material viewer asks for: the
  // same object, but rendered in the page (a PDF in a frame) instead of
  // being pushed straight into the downloads folder. Its Content-Type has to
  // be pinned too, since some S3-compatible backends serve a stored object
  // as application/octet-stream, which no browser will render.
  getSignedUrl(key, expiresInSeconds, responseFilename, { disposition = 'attachment', contentType } = {}) {
    return getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(responseFilename
          ? { ResponseContentDisposition: `${disposition}; filename="${responseFilename.replace(/"/g, '')}"` }
          : {}),
        ...(contentType ? { ResponseContentType: contentType } : {}),
      }),
      { expiresIn: expiresInSeconds }
    )
  }

  async deleteObject(key) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async headObject(key) {
    const result = await s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
    return { size: result.ContentLength, contentType: result.ContentType }
  }
}
