import { REPORT_TYPES, reportDataService } from '../services/reports/reportData.service.js'
import { reportExportService } from '../services/reports/reportExport.service.js'
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
    const { format, ...filters } = req.validatedQuery

    const { columns, rows } = await reportDataService.build(type, filters)
    const filename = filenameFor(type, format)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    if (format === 'csv') {
      res.setHeader('Content-Type', reportExportService.contentType('csv'))
      res.send(reportExportService.toCsv({ columns, rows }))
      return
    }

    if (format === 'xlsx') {
      const buffer = await reportExportService.toXlsxBuffer({ columns, rows }, type)
      res.setHeader('Content-Type', reportExportService.contentType('xlsx'))
      res.send(buffer)
      return
    }

    res.setHeader('Content-Type', reportExportService.contentType('pdf'))
    reportExportService.streamPdf({ columns, rows }, type, res)
  }),
}
