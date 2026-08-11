import { Worker } from 'bullmq'
import { logger } from './config/logger.js'
import { connectDatabase } from './config/db.js'
import { redisConnection } from './config/redis.js'
import { VIDEO_PROCESSING_QUEUE } from './jobs/videoProcessingQueue.js'
import { processVideo } from './video/processVideo.js'
import { REMINDER_QUEUE, scheduleReminderChecks } from './jobs/reminderQueue.js'
import { runDeadlineChecks } from './jobs/reminderJob.js'

async function main() {
  await connectDatabase()

  const videoWorker = new Worker(
    VIDEO_PROCESSING_QUEUE,
    async (job) => {
      if (job.name === 'process') {
        await processVideo(job.data.videoId)
      }
    },
    { connection: redisConnection, concurrency: 2 }
  )

  videoWorker.on('completed', (job) => {
    logger.info('Video processing job completed', { jobId: job.id, videoId: job.data.videoId })
  })
  videoWorker.on('failed', (job, err) => {
    logger.error('Video processing job failed', {
      jobId: job?.id,
      videoId: job?.data?.videoId,
      error: err.message,
    })
  })

  const reminderWorker = new Worker(
    REMINDER_QUEUE,
    async (job) => {
      if (job.name === 'check-deadlines') {
        return runDeadlineChecks()
      }
    },
    { connection: redisConnection, concurrency: 1 }
  )

  reminderWorker.on('failed', (job, err) => {
    logger.error('Reminder job failed', { jobId: job?.id, error: err.message })
  })

  await scheduleReminderChecks()

  logger.info('Video processing worker started')
  logger.info('Reminder worker started (deadline checks every 15 minutes)')

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down worker`)
    await Promise.all([videoWorker.close(), reminderWorker.close()])
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error) => {
  logger.error('Failed to start worker', { error: error.message })
  process.exit(1)
})
