import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const AI_GENERATION_QUEUE = 'ai-generation'

export const aiGenerationQueue = new Queue(AI_GENERATION_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // **One attempt.** Every retry is another paid model call, and the
    // failures this sees are not transient: a source with no text, a
    // response that would not parse, a refusal. A retry would double the
    // bill to produce the same failure — and the row already says what
    // happened, so re-running is the author's decision.
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
})

export function enqueueAiGeneration(jobId) {
  return aiGenerationQueue.add('generate', { jobId: String(jobId) })
}
