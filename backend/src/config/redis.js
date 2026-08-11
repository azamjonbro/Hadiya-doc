import Redis from 'ioredis'
import { env } from './env.js'

// maxRetriesPerRequest must be null for BullMQ's blocking commands to work
// correctly — this is BullMQ's own documented requirement for the
// connection it's handed.
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
})
