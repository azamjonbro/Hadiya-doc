/**
 * Put every FAILED video back through the encoder.
 *
 * For the case where the failure was the host, not the file — the home
 * server ran three days without ffmpeg and every upload in that window
 * died with `spawn ffprobe ENOENT`. Reprocessing is idempotent (the
 * originals are still in the bucket; processVideo overwrites the renditions).
 *
 *   node src/scripts/requeueFailedVideos.js            # report only
 *   node src/scripts/requeueFailedVideos.js --apply    # requeue
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { Video } from '../models/video.model.js'
import { enqueueVideoProcessing } from '../jobs/videoProcessingQueue.js'
import { redisConnection } from '../config/redis.js'

const apply = process.argv.includes('--apply')

await connectDatabase()
const failed = await Video.find({ processingStatus: 'FAILED' }, { title: 1, processingError: 1 }).lean()

console.log(`${failed.length} failed video(s)${apply ? ', requeueing' : ' (pass --apply to requeue)'}`)
for (const video of failed) {
  console.log(`  ${video._id}  ${video.title}  — ${video.processingError}`)
  if (apply) {
    await Video.updateOne({ _id: video._id }, { $set: { processingStatus: 'PENDING', processingError: '' } })
    await enqueueVideoProcessing(String(video._id))
  }
}

await mongoose.connection.close()
redisConnection.disconnect()
process.exit(0)
