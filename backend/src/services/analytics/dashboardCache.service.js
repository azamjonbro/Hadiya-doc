import { redisConnection } from '../../config/redis.js'
import { DashboardCache } from '../../models/dashboardCache.model.js'
import { computeDashboard } from '../../analytics/dashboardAggregation.js'
import { logger } from '../../config/logger.js'

const REDIS_KEY = 'dashboard:admin'
const REDIS_TTL_SECONDS = 15 * 60

export const dashboardCacheService = {
  // Called only by the scheduled job — never by a request handler.
  async recompute() {
    const payload = await computeDashboard()
    await Promise.all([
      redisConnection.set(REDIS_KEY, JSON.stringify(payload), 'EX', REDIS_TTL_SECONDS),
      DashboardCache.findOneAndUpdate(
        { key: 'admin-dashboard' },
        { payload, generatedAt: payload.generatedAt },
        { upsert: true }
      ),
    ])
    return payload
  },

  // Read path for the admin dashboard endpoint — Redis first, materialized
  // Mongo doc as fallback (spec §38). Never runs the aggregation itself.
  async read() {
    try {
      const cached = await redisConnection.get(REDIS_KEY)
      if (cached) return JSON.parse(cached)
    } catch (error) {
      logger.warn('Dashboard cache read from Redis failed, falling back to Mongo', { error: error.message })
    }

    const doc = await DashboardCache.findOne({ key: 'admin-dashboard' })
    return doc ? { ...doc.payload, generatedAt: doc.generatedAt.toISOString(), stale: true } : null
  },
}
