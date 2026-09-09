import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const COMPLIANCE_QUEUE = 'compliance'
export const COMPLIANCE_SCHEDULER_ID = 'daily-compliance-sweep'

export const complianceQueue = new Queue(COMPLIANCE_QUEUE, { connection: redisConnection })

/**
 * The daily pass over recurring training.
 *
 * Daily because the cycle is per person: somebody's twelve months are up on
 * their own anniversary, not on a company-wide date, so there is no single
 * moment to run this at. A daily sweep means nobody's retraining is noticed
 * more than a day late.
 *
 * upsertJobScheduler, not `add({ repeat })` — BullMQ 6 removed `repeat`
 * from Queue.add and ignores it silently, which is how a daily job ends up
 * running once per worker start and never again.
 */
export function scheduleComplianceSweep() {
  return complianceQueue.upsertJobScheduler(
    COMPLIANCE_SCHEDULER_ID,
    { every: 24 * 60 * 60 * 1000 },
    { name: 'sweep' }
  )
}

/** Runs one rule now — what "apply" in the admin screen does. */
export function queueComplianceRule(ruleId) {
  return complianceQueue.add(
    'rule',
    { ruleId: String(ruleId) },
    { jobId: `rule:${ruleId}`, attempts: 3, removeOnComplete: 50, removeOnFail: 100 }
  )
}
