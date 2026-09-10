/**
 * The orphan sweep from the command line.
 *
 *   npm run media:orphans          # report
 *   npm run media:orphans -- --apply
 *
 * The scheduled job does the same thing nightly (mediaCleanupQueue.js); this
 * is for the operator who wants to look before the schedule does, and for
 * the first run on a deployment that has been accumulating since before the
 * sweep existed.
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { sweepOrphans } from '../services/media/mediaCleanup.service.js'
import { redisConnection } from '../config/redis.js'

const apply = process.argv.includes('--apply')

await connectDatabase()
const result = await sweepOrphans({ apply })

const megabytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
console.log(apply ? 'Deleting orphans' : 'Report only (pass --apply to delete)')
for (const [area, data] of Object.entries(result.areas)) {
  console.log(`  ${area.padEnd(10)} ${String(data.objects).padStart(6)} objects  ${megabytes(data.bytes).padStart(10)}`)
  if (data.sample.length) console.log(`             e.g. ${data.sample.join(', ')}`)
}
console.log(`  total      ${String(result.totalObjects).padStart(6)} objects  ${megabytes(result.totalBytes).padStart(10)}`)
if (apply) console.log(`  deleted    ${result.deleted}`)
console.log(`  grace      ${result.graceDays} days`)

await mongoose.connection.close()
redisConnection.disconnect()
process.exit(0)
