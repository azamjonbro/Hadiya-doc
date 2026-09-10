import { AiGenerationJob } from '../../models/aiGenerationJob.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { enqueueAiGeneration } from '../../jobs/aiGenerationQueue.js'
import { logger } from '../../config/logger.js'
import { errorMessage } from '../../utils/errorMessage.js'
import { ApiError } from '../../utils/ApiError.js'
import { aiBudgetService } from './aiBudget.service.js'
import { aiCourseService } from './aiCourse.service.js'
import { aiQuizService } from './aiQuiz.service.js'

/**
 * Starting, running and reading generation jobs (10.1).
 *
 * The dispatcher is deliberately thin: it owns the lifecycle (queued →
 * running → done/failed), the budget check, the usage record and the audit
 * entry, and knows nothing about prompts. Each generator owns its own
 * prompt and schema, which is what keeps "how a course is written" in one
 * file instead of spread through job plumbing.
 */

// The `deps` argument is how a test drives a whole job without an API key
// (there is none in development): the dispatcher passes it straight to the
// generator, which uses it in place of the model call.
const RUNNERS = {
  COURSE_OUTLINE: (job, deps) => aiCourseService.run(job, deps),
  QUIZ: (job, deps) => aiQuizService.run(job, deps),
}

function toPublicJob(job) {
  return {
    id: job._id.toString(),
    type: job.type,
    status: job.status,
    courseId: job.courseId ? String(job.courseId) : null,
    topicId: job.topicId ? String(job.topicId) : null,
    sourceName: job.sourceName,
    sourceChars: job.sourceChars,
    result: job.result,
    error: job.error,
    usage: {
      model: job.usage?.model ?? '',
      inputTokens: job.usage?.inputTokens ?? 0,
      outputTokens: job.usage?.outputTokens ?? 0,
    },
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
  }
}

export const aiGenerationService = {
  /**
   * Queues a job and hands back its id.
   *
   * The request does not wait: a course outline from a long document is
   * tens of seconds of model time, which is past every proxy's patience.
   * The author polls the job — the same shape a video upload or a SCORM
   * import already has.
   */
  async create(actor, { type, params = {}, courseId = null, topicId = null, sourceName = '', sourceChars = 0 }) {
    if (!RUNNERS[type]) throw ApiError.badRequest('Unknown generation type', 'AI_UNKNOWN_TYPE')
    await aiBudgetService.assertCanGenerate()

    const job = await AiGenerationJob.create({
      type,
      status: 'PENDING',
      requestedBy: actor.id,
      courseId,
      topicId,
      params,
      sourceName,
      sourceChars,
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'AI_GENERATION_REQUESTED',
      entity: 'AiGenerationJob',
      entityId: job._id.toString(),
      // The parameters, not the source text: the audit log is read by
      // people and a hundred kilobytes of a manual in it helps nobody.
      metadata: { type, sourceName, sourceChars, hasSource: Boolean(params.sourceText) },
    })

    await enqueueAiGeneration(job._id).catch(async (error) => {
      // Queued is the whole point of the row; if it cannot be queued the
      // author should see that now rather than watch PENDING forever.
      await AiGenerationJob.updateOne(
        { _id: job._id },
        { $set: { status: 'FAILED', error: 'Could not be queued', finishedAt: new Date() } }
      )
      logger.warn('Could not enqueue an AI generation job', { jobId: String(job._id), error: error.message })
    })

    return toPublicJob(await AiGenerationJob.findById(job._id))
  },

  /**
   * Runs one job. Called by the worker, never by a request.
   *
   * The source text is dropped from `params` when the job finishes: it was
   * the input to one prompt, it can be hundreds of kilobytes, and keeping a
   * copy of every uploaded manual in the jobs collection is a storage bill
   * with no reader.
   */
  async run(jobId, deps) {
    const job = await AiGenerationJob.findById(jobId)
    if (!job) {
      logger.warn('AI generation job vanished before it ran', { jobId: String(jobId) })
      return null
    }
    if (job.status !== 'PENDING') {
      // A second delivery of the same job would otherwise generate — and
      // charge for — the same course twice.
      logger.info('Skipping an AI job that is not pending', { jobId: String(jobId), status: job.status })
      return null
    }

    await AiGenerationJob.updateOne({ _id: job._id }, { $set: { status: 'RUNNING', startedAt: new Date() } })

    try {
      const { result, usage } = await RUNNERS[job.type](job, deps)
      await AiGenerationJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'DONE',
            result,
            usage,
            finishedAt: new Date(),
            ...(result?.courseId ? { courseId: result.courseId } : {}),
          },
          $unset: { 'params.sourceText': '' },
        }
      )
      logger.info('AI generation finished', {
        jobId: String(job._id),
        type: job.type,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })

      await auditLogRepository.record({
        actor: job.requestedBy,
        action: 'AI_GENERATION_COMPLETED',
        entity: 'AiGenerationJob',
        entityId: job._id.toString(),
        metadata: { type: job.type, ...result, usage },
      })

      return result
    } catch (error) {
      const reason = errorMessage(error)
      await AiGenerationJob.updateOne(
        { _id: job._id },
        {
          $set: { status: 'FAILED', error: reason.slice(0, 500), finishedAt: new Date() },
          $unset: { 'params.sourceText': '' },
        }
      )
      logger.warn('AI generation failed', { jobId: String(job._id), type: job.type, error: reason })
      // Not rethrown: the queue is configured for a single attempt and the
      // row carries the reason, so a rethrow would only add noise.
      return null
    }
  },

  async listMine(actor, { limit = 20 } = {}) {
    const rows = await AiGenerationJob.find({ requestedBy: actor.id })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean()
    return rows.map(toPublicJob)
  },

  async get(actor, id) {
    const job = await AiGenerationJob.findById(id).lean()
    if (!job) throw ApiError.notFound('Job not found')
    // A generation job is the author's own; reading somebody else's is not
    // a feature anybody asked for.
    if (String(job.requestedBy) !== String(actor.id) && !actor.permissions?.includes('analytics:view:all')) {
      throw ApiError.notFound('Job not found')
    }
    return toPublicJob(job)
  },
}
