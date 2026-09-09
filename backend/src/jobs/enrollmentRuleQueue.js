import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const ENROLLMENT_RULE_QUEUE = 'enrollment-rules'
export const ENROLLMENT_RULE_SCHEDULER_ID = 'daily-enrollment-sweep'

export const enrollmentRuleQueue = new Queue(ENROLLMENT_RULE_QUEUE, { connection: redisConnection })

/**
 * The nightly sweep.
 *
 * A rule has to be re-applied on a schedule as well as on the events that
 * could match it, because the things it matches on change outside the
 * platform too: an HR import moves somebody's department, a group gains a
 * member, a course is added to a rule that already matched two hundred
 * people. Only the sweep catches those.
 *
 * upsertJobScheduler, not `add({ repeat })` — BullMQ 6 removed `repeat`
 * from Queue.add and ignores it silently, which is how a "daily" job ends
 * up running once per worker start and never again.
 */
export function scheduleEnrollmentRuleSweep() {
  return enrollmentRuleQueue.upsertJobScheduler(
    ENROLLMENT_RULE_SCHEDULER_ID,
    // Every 24 hours from the first run rather than at a fixed hour: this
    // box also serves six other sites, and stacking every scheduled job on
    // 03:00 is how a 1.9 GB VM discovers its memory limit.
    { every: 24 * 60 * 60 * 1000 },
    { name: 'sweep' }
  )
}

/**
 * One person, now.
 *
 * Also refreshes the dynamic groups they could have moved in or out of
 * (5.5) — the trigger is identical (role, department, branch, position), and
 * a second queue firing on the same four fields would be two jobs racing to
 * read the same person.
 *
 * Queued when somebody is created or their role, department, branch or
 * position changes — the four things a rule matches on. On a queue rather
 * than inline because it walks every active rule, and nobody editing an
 * employee record should wait for that.
 *
 * The jobId collapses repeats: saving the same employee three times in a
 * minute queues one evaluation, not three.
 */
export function queueUserEvaluation(userId) {
  return enrollmentRuleQueue.add(
    'user',
    { userId: String(userId) },
    {
      jobId: `user:${userId}`,
      delay: 5000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  )
}
