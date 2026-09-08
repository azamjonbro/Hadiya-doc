import { Worker } from 'bullmq'
import { logger } from './config/logger.js'
import { connectDatabase } from './config/db.js'
import { redisConnection } from './config/redis.js'
import { VIDEO_PROCESSING_QUEUE } from './jobs/videoProcessingQueue.js'
import { processVideo } from './video/processVideo.js'
import { REMINDER_QUEUE, scheduleReminderChecks } from './jobs/reminderQueue.js'
import { runDeadlineChecks } from './jobs/reminderJob.js'
import {
  DASHBOARD_AGGREGATION_QUEUE,
  scheduleDashboardAggregation,
} from './jobs/dashboardAggregationQueue.js'
import { dashboardCacheService } from './services/analytics/dashboardCache.service.js'
import { BACKUP_QUEUE, scheduleDailyBackup } from './jobs/backupQueue.js'
import { DELIVERY_QUEUE, handleDeliveryFailure } from './jobs/deliveryQueue.js'
import { mailService, isMailConfigured, closeTransport } from './services/notifications/mail.service.js'
import { createBackup } from './services/backup/backup.service.js'
import { env } from './config/env.js'

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

  const dashboardWorker = new Worker(
    DASHBOARD_AGGREGATION_QUEUE,
    async (job) => {
      if (job.name === 'compute') {
        await dashboardCacheService.recompute()
      }
    },
    { connection: redisConnection, concurrency: 1 }
  )

  dashboardWorker.on('failed', (job, err) => {
    logger.error('Dashboard aggregation job failed', { jobId: job?.id, error: err.message })
  })

  const backupWorker = new Worker(
    BACKUP_QUEUE,
    async (job) => {
      if (job.name === 'dump') {
        return createBackup()
      }
    },
    { connection: redisConnection, concurrency: 1 }
  )

  backupWorker.on('failed', (job, err) => {
    // Loud on purpose: a backup nobody notices failing is the reason a
    // restore is discovered to be impossible on the day it is needed.
    logger.error('Database backup failed', { jobId: job?.id, error: err.message })
  })

  const deliveryWorker = new Worker(
    DELIVERY_QUEUE,
    async (job) => {
      if (job.name === 'mail') {
        // attemptsMade is the count of attempts that have already finished,
        // so the attempt now running is one past it.
        return mailService.send({ ...job.data, attempt: job.attemptsMade + 1 })
      }
    },
    // Low concurrency on purpose: relays rate-limit, and a burst of parallel
    // connections from one IP is how a sender gets throttled or blocked.
    { connection: redisConnection, concurrency: 5 }
  )

  deliveryWorker.on('failed', (job, err) => {
    handleDeliveryFailure(job, err).catch((error) => {
      logger.error('Could not record mail failure', { error: error.message })
    })
  })

  await scheduleReminderChecks()
  await scheduleDashboardAggregation()
  const backupsScheduled = await scheduleDailyBackup()

  logger.info('Video processing worker started')
  logger.info('Reminder worker started (deadline checks every 15 minutes)')
  logger.info('Dashboard aggregation worker started (recomputes every 5 minutes)')
  logger.info(
    isMailConfigured()
      ? `Delivery worker started (SMTP ${env.SMTP_HOST}:${env.SMTP_PORT})`
      : 'Delivery worker started — SMTP not configured, mail will be recorded as SKIPPED'
  )
  logger.info(
    backupsScheduled
      ? `Backup worker started (nightly dump at "${env.BACKUP_SCHEDULE_CRON}" ${env.APP_TIMEZONE}, ${env.BACKUP_RETENTION_DAYS}-day retention)`
      : 'Backup worker started — no schedule registered (BACKUP_ENABLED=false)'
  )

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down worker`)
    await Promise.all([
      videoWorker.close(),
      reminderWorker.close(),
      dashboardWorker.close(),
      backupWorker.close(),
      deliveryWorker.close(),
    ])
    closeTransport()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error) => {
  logger.error('Failed to start worker', { error: error.message })
  process.exit(1)
})
