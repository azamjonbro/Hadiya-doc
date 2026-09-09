import { REPORT_TYPES, reportDataService } from '../services/reports/reportData.service.js'
import { auditLogRepository } from '../repositories/auditLog.repository.js'
import { reportExportService } from '../services/reports/reportExport.service.js'
import { reportTranslator } from '../services/reports/reportI18n.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { exportJobService } from '../services/reports/exportJob.service.js'
import { queueExport } from '../jobs/exportQueue.js'

function filenameFor(type, format) {
  return `${type}-${new Date().toISOString().slice(0, 10)}.${format}`
}

export const reportController = {
  listTypes: asyncHandler(async (req, res) => {
    sendSuccess(res, { types: REPORT_TYPES })
  }),

  export: asyncHandler(async (req, res) => {
    const { type } = req.params
    const { format, lang, ...filters } = req.validatedQuery
    const t = reportTranslator(lang)
    // The sheet/document title is localised, but the download filename stays
    // the ASCII slug — non-ASCII in Content-Disposition is where downloads
    // start arriving with mangled names.
    const title = t(`type.${type}`, type)

    const { columns, rows, totalRows, exportedRows, truncated } = await reportDataService.build(
      req.user,
      type,
      filters,
      lang,
      { scopedUserIds: req.scopedUserIds }
    )

    // An export leaves the system with employee data in it, so it is recorded
    // the way every other write is. Without this there was no way to answer
    // "who took a copy of the staff list, and when" after the fact.
    await auditLogRepository.record({
      actor: req.user.id,
      action: 'REPORT_EXPORTED',
      entity: 'Report',
      entityId: type,
      metadata: { format, lang, filters, rowCount: rows.length },
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })

    const filename = filenameFor(type, format)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    // AT-22. The body is a file, so the only place to say "this is not all
    // of it" is a header — and a silent cut is the thing being fixed: a
    // spreadsheet of 5 000 rows out of 8 000 looks complete, and the 3 000
    // missing people are indistinguishable from people who do not exist.
    res.setHeader('X-Report-Total-Rows', String(totalRows))
    res.setHeader('X-Report-Exported-Rows', String(exportedRows))
    res.setHeader('X-Report-Truncated', truncated ? 'true' : 'false')

    if (format === 'csv') {
      res.setHeader('Content-Type', reportExportService.contentType('csv'))
      res.send(reportExportService.toCsv({ columns, rows }))
      return
    }

    if (format === 'xlsx') {
      const buffer = await reportExportService.toXlsxBuffer({ columns, rows }, title)
      res.setHeader('Content-Type', reportExportService.contentType('xlsx'))
      res.send(buffer)
      return
    }

    res.setHeader('Content-Type', reportExportService.contentType('pdf'))
    reportExportService.streamPdf({ columns, rows }, title, res, { generatedAtLabel: t('pdf.generatedAt') })
  }),

  /**
   * Queues a full export.
   *
   * The synchronous route caps at 5 000 rows because somebody is waiting on
   * the response. This is the other half of AT-22: the whole company, built
   * by the worker, fetched when it is ready.
   */
  queueExport: asyncHandler(async (req, res) => {
    const { type } = req.params
    const { format, lang, ...filters } = req.validatedQuery

    // Resolved here, not in the worker: the job has to export what this
    // person could see when they asked.
    const job = await exportJobService.create(req.user, {
      type,
      format: format === 'pdf' ? 'xlsx' : format,
      lang,
      filters,
      scopedUserIds: req.scopedUserIds ?? null,
    })
    await queueExport(job._id)

    sendSuccess(res, { id: String(job._id), status: job.status }, 'Export queued', 202)
  }),

  exportJobs: asyncHandler(async (req, res) => {
    sendSuccess(res, await exportJobService.listFor(req.user))
  }),

  exportJob: asyncHandler(async (req, res) => {
    sendSuccess(res, await exportJobService.get(req.user, req.params.jobId))
  }),
}
