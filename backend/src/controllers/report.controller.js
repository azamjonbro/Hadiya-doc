import { REPORT_TYPES, reportDataService } from '../services/reports/reportData.service.js'
import { auditLogRepository } from '../repositories/auditLog.repository.js'
import { reportExportService } from '../services/reports/reportExport.service.js'
import { reportTranslator } from '../services/reports/reportI18n.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

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

    const { columns, rows } = await reportDataService.build(req.user, type, filters, lang, {
      scopedUserIds: req.scopedUserIds,
    })

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
}
