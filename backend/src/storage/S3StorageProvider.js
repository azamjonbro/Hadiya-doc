import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client, s3SigningClient } from '../config/storage.js'

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

  // contentLength is only needed when `body` is a stream: the SDK cannot
  // measure one, and S3 rejects a PUT with no length rather than reading to
  // the end. Callers passing a Buffer or string leave it out.
  async putObject(key, body, contentType, { contentLength } = {}) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
      })
    )
  }

  // Paginates to completion — a truncated listing would make a retention
  // sweep believe old objects are already gone.
  async listObjects(prefix) {
    const objects = []
    let continuationToken
    do {
      const result = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ...(prefix ? { Prefix: prefix } : {}),
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        })
      )
      for (const item of result.Contents ?? []) {
        objects.push({ key: item.Key, size: item.Size, lastModified: item.LastModified })
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined
    } while (continuationToken)
    return objects
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
      s3SigningClient,
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
