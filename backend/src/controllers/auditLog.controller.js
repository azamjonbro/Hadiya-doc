import { auditLogService } from '../services/audit/auditLog.service.js'
import { auditLogRepository } from '../repositories/auditLog.repository.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const auditLogController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await auditLogService.list(req.validatedQuery))
  }),

  filterOptions: asyncHandler(async (req, res) => {
    sendSuccess(res, await auditLogService.filterOptions())
  }),

  export: asyncHandler(async (req, res) => {
    const filters = req.validatedQuery

    // Reading the log is itself an auditable act — an export especially, since
    // it takes a copy of who did what out of the system. Recorded before the
    // stream starts: once bytes are on the wire the status is no longer ours
    // to change, and a copy that left without a trace is the failure mode this
    // whole page exists to prevent.
    await auditLogRepository.record({
      actor: req.user.id,
      action: 'AUDIT_LOG_EXPORTED',
      entity: 'AuditLog',
      metadata: { filters },
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })

    const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    for await (const line of auditLogService.exportCsv(filters)) {
      // Respect backpressure: without this a large export buffers the whole
      // collection in the socket's write queue, which is the memory blow-up
      // the streaming cursor was meant to avoid.
      if (!res.write(line)) await new Promise((resolve) => res.once('drain', resolve))
    }
    res.end()
  }),
}
