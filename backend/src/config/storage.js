import { S3Client } from '@aws-sdk/client-s3'
import { env } from './env.js'

// forcePathStyle is required for MinIO/R2-style S3-compatible endpoints —
// virtual-hosted-style bucket addressing (the AWS SDK default) doesn't
// resolve against them.
const credentials = {
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
}

// Everything the server does itself: uploads, video segment reads, deletes.
// Stays on whatever S3_ENDPOINT is, which in this deployment is loopback.
export const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials,
})

// Used for one thing: computing presigned URLs. A signature covers the host
// and path it was made for, so a link signed against 127.0.0.1 is not merely
// unreachable from a browser — re-pointing it at the public host would also
// invalidate it. Hence a second client that differs only in endpoint; it
// never sends a request, it only signs.
export const s3SigningClient = env.S3_SIGNING_ENDPOINT
  ? new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_SIGNING_ENDPOINT,
      forcePathStyle: true,
      credentials,
    })
  : s3Client
