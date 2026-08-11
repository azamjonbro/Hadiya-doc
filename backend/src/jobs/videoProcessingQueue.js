import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const VIDEO_PROCESSING_QUEUE = 'video-processing'

export const videoProcessingQueue = new Queue(VIDEO_PROCESSING_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

export function enqueueVideoProcessing(videoId) {
  return videoProcessingQueue.add('process', { videoId })
}
