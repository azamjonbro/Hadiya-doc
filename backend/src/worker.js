import { Worker } from 'bullmq'
import { logger } from './config/logger.js'
import { connectDatabase } from './config/db.js'
import { redisConnection } from './config/redis.js'
import { VIDEO_PROCESSING_QUEUE } from './jobs/videoProcessingQueue.js'
import { processVideo } from './video/processVideo.js'

async function main() {
  await connectDatabase()

  const worker = new Worker(
    VIDEO_PROCESSING_QUEUE,
    async (job) => {
      if (job.name === 'process') {
        await processVideo(job.data.videoId)
      }
    },
    { connection: redisConnection, concurrency: 2 }
  )

  worker.on('completed', (job) => {
    logger.info('Video processing job completed', { jobId: job.id, videoId: job.data.videoId })
  })
  worker.on('failed', (job, err) => {
    logger.error('Video processing job failed', {
      jobId: job?.id,
      videoId: job?.data?.videoId,
      error: err.message,
    })
  })

  logger.info('Video processing worker started')

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down worker`)
    await worker.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error) => {
  logger.error('Failed to start worker', { error: error.message })
  process.exit(1)
})
