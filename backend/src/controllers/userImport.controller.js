import { userImportService } from '../services/users/userImport.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'

export const userImportController = {
  dryRun: asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file was uploaded', 'IMPORT_NO_FILE')
    sendSuccess(
      res,
      await userImportService.dryRun(req.user, {
        buffer: req.file.buffer,
        fileName: req.file.originalname ?? '',
      })
    )
  }),

  commit: asyncHandler(async (req, res) => {
    const result = await userImportService.commit(req.user, req.body.jobId)
    // The generated passwords are in this response and nowhere else. Said in
    // the message so the operator knows to keep the page open, rather than
    // discovering it after closing the tab.
    sendSuccess(res, result, 'Imported — the passwords below are shown only once')
  }),

  errorReport: asyncHandler(async (req, res) => {
    const buffer = await userImportService.errorWorkbook(req.user, req.params.jobId)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${req.params.jobId}.xlsx"`)
    res.send(Buffer.from(buffer))
  }),
}
