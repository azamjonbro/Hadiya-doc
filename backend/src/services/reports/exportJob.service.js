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
import { errorMessage } from '../../utils/errorMessage.js'

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
  async create(
    actor,
    { type, format = 'xlsx', lang = 'uz', filters = {}, scopedUserIds = null, notify = [], scheduleId = null }
  ) {
    const job = await ExportJob.create({
      requestedBy: actor.id,
      type,
      format,
      lang,
      filters,
      scopedUserIds,
      notify,
      scheduleId,
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

      // The requester always, plus a schedule's audience if it has one. The
      // Set is what stops a schedule's owner being told twice when they are
      // also on their own recipient list.
      const audience = [...new Set([String(job.requestedBy), ...(job.notify ?? []).map(String)])]
      await notificationService
        .notifyMany(
          audience.map((userId) => ({
            userId,
            type: 'REPORT_READY',
            vars: { reportName: title, rowCount: String(rows.length) },
            relatedEntityType: 'ExportJob',
            relatedEntityId: String(job._id),
          }))
        )
        .catch((error) => logger.warn('Export-ready notice failed', { error: errorMessage(error) }))

      return { rows: rows.length, truncated: job.truncated }
    } catch (error) {
      job.status = 'FAILED'
      // The message, not the stack: this is shown to whoever asked for the
      // export, and a stack trace tells them nothing they can act on.
      //
      // Through errorMessage() because `error.message` can be the empty
      // string — a storage backend that is down throws AggregateError
      // [ECONNREFUSED] with no message at all, and this row was the only
      // record of the failure. "FAILED" with a blank reason is the same
      // silence AT-22 exists to remove, one level down.
      job.error = errorMessage(error, 'The export could not be built')
      job.finishedAt = new Date()
      await job.save()

      // A scheduled build reports back to its timetable, or the schedule row
      // goes on claiming its last run was fine (8.4).
      if (job.scheduleId) {
        const { scheduledReportService } = await import('./scheduledReport.service.js')
        await scheduledReportService
          .recordJobFailure(job.scheduleId, job.error)
          .catch((inner) => logger.warn('Could not mark the schedule failed', { error: errorMessage(inner) }))
      }

      throw error
    }
  },

  async listFor(actor) {
    const rows = await ExportJob.find({
      $or: [{ requestedBy: actor.id }, { notify: actor.id }],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
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

    /**
     * Two ways to be allowed here, and only two.
     *
     * The requester, obviously. And anyone a scheduled report named as a
     * recipient (8.4) — which is a deliberate act of sharing by someone who
     * could already see the data, the same as them emailing the file, and
     * it is recorded below as such.
     *
     * The trade-off is worth naming rather than hiding: the file's contents
     * are bounded by the *schedule owner's* scope, so a recipient fenced
     * more narrowly than the owner receives more than they could have
     * exported themselves. That is the owner's decision to make, they are
     * the one the audit log names as having made it, and the route above
     * still requires report:export — being told a file exists is not the
     * same as being able to open it.
     *
     * Anything else is somebody else's data, usually the staff list.
     */
    const isRequester = String(job.requestedBy) === String(actor.id)
    const isRecipient = (job.notify ?? []).some((id) => String(id) === String(actor.id))
    if (!isRequester && !isRecipient) throw ApiError.forbidden('Not your export')

    const payload = toPublicJob(job)
    if (job.status === 'READY' && job.fileKey) {
      payload.url = await exportStorage.getSignedUrl(
        job.fileKey,
        DOWNLOAD_URL_TTL_SECONDS,
        `${job.type}-${new Date(job.createdAt).toISOString().slice(0, 10)}.${job.format}`
      )
      payload.expiresIn = DOWNLOAD_URL_TTL_SECONDS

      // Handing out the link is the moment a copy leaves, so it is recorded
      // like the synchronous export is — otherwise the async path was the
      // way to take the staff list without appearing in the audit log.
      await auditLogRepository
        .record({
          actor: actor.id,
          action: 'REPORT_EXPORTED',
          entity: 'ExportJob',
          entityId: String(job._id),
          metadata: {
            type: job.type,
            format: job.format,
            rowCount: job.rowCount,
            via: isRequester ? 'export-job' : 'scheduled-report',
          },
        })
        .catch((error) => logger.warn('Export download audit failed', { error: errorMessage(error) }))
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
