import { redisConnection } from '../config/redis.js'
import { logger } from '../config/logger.js'

// Redis is a performance optimization here, never a correctness dependency
// (spec §39) — every helper fails open to the caller's live query if Redis
// is unreachable, and callers still treat Mongo as the source of truth.
// Distinct from dashboardCache.service.js, which has its own Mongo
// materialized-doc fallback because that data is expensive enough to
// justify surviving a Redis outage; metadata reads here are cheap enough
// to just re-query on a cache miss.

export async function cacheGet(key) {
  try {
    const raw = await redisConnection.get(key)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    logger.warn('Cache read failed, falling back to a live query', { key, error: error.message })
    return null
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  try {
    await redisConnection.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (error) {
    logger.warn('Cache write failed', { key, error: error.message })
  }
}

export async function cacheDel(...keys) {
  if (keys.length === 0) return
  try {
    await redisConnection.del(...keys)
  } catch (error) {
    logger.warn('Cache invalidation failed', { keys, error: error.message })
  }
}
