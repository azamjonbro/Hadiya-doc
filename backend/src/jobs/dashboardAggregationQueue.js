import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const DASHBOARD_AGGREGATION_QUEUE = 'dashboard-aggregation'

export const dashboardAggregationQueue = new Queue(DASHBOARD_AGGREGATION_QUEUE, { connection: redisConnection })

export function scheduleDashboardAggregation() {
  return dashboardAggregationQueue.add(
    'compute',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      // Stable jobId so restarting the worker doesn't register a duplicate
      // repeatable schedule (same pattern as reminderQueue.js).
      jobId: 'compute-dashboard-repeat',
    }
  )
}

// BullMQ's `repeat` only fires after the first interval elapses — this
// queues one immediate run so the cache is populated within seconds of the
// worker starting, instead of the admin dashboard being empty for 5 minutes
// after every deploy/restart.
export function runDashboardAggregationNow() {
  return dashboardAggregationQueue.add('compute', {})
}
