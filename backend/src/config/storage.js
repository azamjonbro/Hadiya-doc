import { S3Client } from '@aws-sdk/client-s3'
import { env } from './env.js'

// forcePathStyle is required for MinIO/R2-style S3-compatible endpoints —
// virtual-hosted-style bucket addressing (the AWS SDK default) doesn't
// resolve against them.
export const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
})
