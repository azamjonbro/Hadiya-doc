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
 *   getSignedUrl(key, expiresInSeconds) -> string
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

  getSignedUrl(key, expiresInSeconds) {
    return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    })
  }

  async deleteObject(key) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async headObject(key) {
    const result = await s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
    return { size: result.ContentLength, contentType: result.ContentType }
  }
}
