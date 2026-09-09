import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const ONBOARDING_QUEUE = 'onboarding'
export const ONBOARDING_SCHEDULER_ID = 'daily-onboarding-start'

export const onboardingQueue = new Queue(ONBOARDING_QUEUE, { connection: redisConnection })

/**
 * The daily "has anybody started work?" pass.
 *
 * `hireDate` is a date typed in weeks ahead of time, so nothing happens at
 * the moment the record is saved — the programme has to begin on the day
 * itself, which only a schedule can do.
 *
 * upsertJobScheduler, not `add({ repeat })`: BullMQ 6 removed `repeat` from
 * Queue.add and ignores it silently, which is how a daily job ends up
 * running once per worker start and never again.
 */
export function scheduleOnboardingStart() {
  return onboardingQueue.upsertJobScheduler(
    ONBOARDING_SCHEDULER_ID,
    { every: 24 * 60 * 60 * 1000 },
    { name: 'start-due' }
  )
}

/**
 * Re-checks one person's onboarding now.
 *
 * Queued when something that could tick a step off has happened — a course
 * finished, a task closed. The jobId collapses repeats so a burst of
 * progress events produces one evaluation.
 */
export function queueOnboardingEvaluation(userId) {
  return onboardingQueue.add(
    'evaluate',
    { userId: String(userId) },
    {
      jobId: `evaluate:${userId}`,
      delay: 3000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  )
}
