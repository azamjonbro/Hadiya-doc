/**
 * Proves that presigned links actually work from outside the box.
 *
 * Materials (audio playback, every download button) and chat attachments are
 * the only things served this way, and their failure mode is silent on the
 * server: the API mints a URL signed for whatever S3_SIGNING_ENDPOINT says,
 * logs a 200, and the browser is left with a host that no longer exists. The
 * only honest check is to sign a link for a real stored object and fetch it
 * the way a browser would.
 *
 * Run it on the server after any change to the public domain, the nginx
 * storage proxy, or S3_SIGNING_ENDPOINT:
 *
 *   npm --prefix backend run check:signing
 *
 * Exits 0 when every bucket answered 200, 1 otherwise, so it can gate a deploy.
 */
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { s3Client } from '../config/storage.js'
import { env } from '../config/env.js'
import { S3StorageProvider } from '../storage/S3StorageProvider.js'

const BUCKETS = [
  { name: env.S3_BUCKET_MATERIALS, label: 'materials (downloads, audio)' },
  { name: env.S3_BUCKET_CHAT, label: 'chat attachments' },
]

async function firstKey(bucket) {
  const result = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }))
  return result.Contents?.[0]?.Key ?? null
}

async function checkBucket({ name, label }) {
  const key = await firstKey(name)
  if (!key) {
    console.log(`SKIP  ${name} (${label}) — bucket is empty, nothing to sign`)
    return true
  }

  const url = await new S3StorageProvider(name).getSignedUrl(key, 120, 'probe.bin', {
    disposition: 'inline',
  })
  const host = new URL(url).host

  // HEAD, not GET: the signature covers the method, and a signed GET URL is
  // still valid for HEAD on S3-compatible storage, so this verifies routing
  // and the signature without pulling the object body across the network.
  let response
  try {
    response = await fetch(url, { method: 'HEAD', redirect: 'manual' })
  } catch (error) {
    console.error(`FAIL  ${name} (${label}) — ${host} unreachable: ${error.message}`)
    return false
  }

  if (!response.ok) {
    console.error(`FAIL  ${name} (${label}) — ${host} answered ${response.status}`)
    return false
  }

  console.log(`OK    ${name} (${label}) — ${host} answered 200`)
  return true
}

const signingHost = env.S3_SIGNING_ENDPOINT || env.S3_ENDPOINT
console.log(`Signing presigned URLs against ${signingHost}\n`)

let allPassed = true
for (const bucket of BUCKETS) {
  // Sequential on purpose: the output is a report an operator reads top to
  // bottom, and two buckets is not worth interleaving.
  // eslint-disable-next-line no-await-in-loop
  const passed = await checkBucket(bucket)
  allPassed = allPassed && passed
}

if (!allPassed) {
  console.error(
    '\nPresigned URLs are not reachable. Check that S3_SIGNING_ENDPOINT is the public API ' +
      'host and that nginx proxies the bucket paths to MinIO without rewriting them ' +
      '(a SigV4 signature covers host + path).'
  )
  process.exit(1)
}

console.log('\nAll presigned URLs reachable.')
process.exit(0)
