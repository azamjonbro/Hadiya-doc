import { ExportJob } from '../../models/exportJob.model.js'
import { reportDataService, ASYNC_MAX_ROWS } from './reportData.service.js'
import { reportExportService } from './reportExport.service.js'
import { reportTranslator } from './reportI18n.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

const exportStorage = new S3StorageProvider(env.S3_BUCKET_MATERIALS)

const RETENTION_DAYS = 7
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60

/**
 * Report exports that are too big to build in a request.
 *
 * The scope is resolved when the job is *queued*, not when it runs. A job
 * has to export what the requester could see when they asked — if their
 * scope widens before the worker picks it up, the file must not quietly
 * widen with it.
 */
export const exportJobService = {
  async create(actor, { type, format = 'xlsx', lang = 'uz', filters = {}, scopedUserIds = null }) {
    const job = await ExportJob.create({
      requestedBy: actor.id,
      type,
      format,
      lang,
      filters,
      scopedUserIds,
      status: 'QUEUED',
      expiresAt: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'REPORT_EXPORT_QUEUED',
      entity: 'ExportJob',
      entityId: job._id.toString(),
      metadata: { type, format, filters },
    })

    return job
  },

  /** Builds the file. Called by the worker. */
  async run(jobId) {
    const job = await ExportJob.findById(jobId)
    if (!job || job.status === 'READY') return null

    job.status = 'RUNNING'
    job.startedAt = new Date()
    await job.save()

    try {
      const actor = { id: String(job.requestedBy) }
      const { columns, rows, totalRows, truncated } = await reportDataService.build(
        actor,
        job.type,
        // The cap is raised, not removed: nobody is waiting on a spinner,
        // but an unbounded export on a shared box is still a way to run it
        // out of memory.
        { ...job.filters, maxRows: ASYNC_MAX_ROWS },
        job.lang,
        // The scope as it stood when the job was queued. `null` there is a
        // real answer — no constraint — and must not be confused with
        // "nobody supplied one", which would make build() recompute it
        // against the requester's scope *now*.
        { scopedUserIds: job.scopedUserIds ?? null }
      )

      const t = reportTranslator(job.lang)
      const title = t(`type.${job.type}`, job.type)
      const buffer =
        job.format === 'csv'
          ? Buffer.from(reportExportService.toCsv({ columns, rows }), 'utf8')
          : await reportExportService.toXlsxBuffer({ columns, rows }, title)

      const key = `exports/${job._id}.${job.format}`
      await exportStorage.putObject(key, buffer, reportExportService.contentType(job.format))

      job.status = 'READY'
      job.fileKey = key
      job.fileSize = buffer.length
      job.rowCount = rows.length
      job.totalRows = totalRows
      job.truncated = Boolean(truncated)
      job.finishedAt = new Date()
      await job.save()

      await notificationService
        .notify({
          userId: job.requestedBy,
          type: 'REPORT_READY',
          vars: { reportName: title, rowCount: String(rows.length) },
          relatedEntityType: 'ExportJob',
          relatedEntityId: String(job._id),
        })
        .catch((error) => logger.warn('Export-ready notice failed', { error: error.message }))

      return { rows: rows.length, truncated: job.truncated }
    } catch (error) {
      job.status = 'FAILED'
      // The message, not the stack: this is shown to whoever asked for the
      // export, and a stack trace tells them nothing they can act on.
      job.error = error.message
      job.finishedAt = new Date()
      await job.save()
      throw error
    }
  },

  async listFor(actor) {
    const rows = await ExportJob.find({ requestedBy: actor.id }).sort({ createdAt: -1 }).limit(20).lean()
    return { items: rows.map(toPublicJob) }
  },

  /**
   * One job, with a download link when it is ready.
   *
   * The link is short-lived and signed. An export of the staff list is
   * exactly the file that must not be shareable by pasting a URL.
   */
  async get(actor, jobId) {
    const job = await ExportJob.findById(jobId).lean()
    if (!job) throw ApiError.notFound('Export not found')
    // Somebody else's export is somebody else's data — often the staff
    // list, filtered to what *they* were allowed to see.
    if (String(job.requestedBy) !== String(actor.id)) throw ApiError.forbidden('Not your export')

    const payload = toPublicJob(job)
    if (job.status === 'READY' && job.fileKey) {
      payload.url = await exportStorage.getSignedUrl(
        job.fileKey,
        DOWNLOAD_URL_TTL_SECONDS,
        `${job.type}-${new Date(job.createdAt).toISOString().slice(0, 10)}.${job.format}`
      )
      payload.expiresIn = DOWNLOAD_URL_TTL_SECONDS
    }
    return payload
  },

  /**
   * Deletes the stored files of expired jobs.
   *
   * The document has a TTL index, but Mongo's TTL monitor only removes the
   * row — it knows nothing about the object in storage, which would
   * otherwise stay in the bucket for ever.
   */
  async cleanup({ now = new Date() } = {}) {
    const expired = await ExportJob.find(
      { expiresAt: { $lte: now }, fileKey: { $ne: '' } },
      { fileKey: 1 }
    ).lean()

    let removed = 0
    for (const job of expired) {
      await exportStorage.deleteObject(job.fileKey).catch((error) => {
        logger.warn('Could not delete an expired export', { key: job.fileKey, error: error.message })
      })
      await ExportJob.updateOne({ _id: job._id }, { $set: { fileKey: '', fileSize: 0 } })
      removed += 1
    }

    if (removed) logger.info('Expired exports cleaned up', { removed })
    return { removed }
  },
}

function toPublicJob(job) {
  return {
    id: String(job._id),
    type: job.type,
    format: job.format,
    status: job.status,
    rowCount: job.rowCount ?? 0,
    totalRows: job.totalRows ?? 0,
    truncated: Boolean(job.truncated),
    error: job.error ?? '',
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    expiresAt: job.expiresAt,
  }
}
