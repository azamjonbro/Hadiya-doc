import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const DASHBOARD_AGGREGATION_QUEUE = 'dashboard-aggregation'
export const DASHBOARD_SCHEDULER_ID = 'compute-dashboard'

export const dashboardAggregationQueue = new Queue(DASHBOARD_AGGREGATION_QUEUE, {
  connection: redisConnection,
})

// Same fix as reminderQueue.js: `add({ repeat })` is silently ignored in
// BullMQ 6, which left the dashboard cache recomputing exactly once per
// deploy and then going stale until the next restart.
//
// A scheduler also queues its first job immediately rather than one interval
// later, so the cache is populated within seconds of the worker starting —
// the separate "compute now" job this used to need alongside it is gone.
export function scheduleDashboardAggregation() {
  return dashboardAggregationQueue.upsertJobScheduler(
    DASHBOARD_SCHEDULER_ID,
    { every: 5 * 60 * 1000 },
    { name: 'compute' }
  )
}
