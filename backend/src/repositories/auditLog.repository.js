import { AuditLog } from '../models/auditLog.model.js'

export const auditLogRepository = {
  record({ actor = null, action, entity, entityId = null, metadata = {}, ip = '', userAgent = '' }) {
    return AuditLog.create({ actor, action, entity, entityId, metadata, ip, userAgent })
  },

  // Shared by listPage, count and streamAll so a page, its total and an
  // export of the same view can never be built from different filters.
  buildFilter({ actor, action, entity, entityId, dateFrom, dateTo }) {
    const filter = {}
    if (actor) filter.actor = actor
    if (action) filter.action = action
    if (entity) filter.entity = entity
    if (entityId) filter.entityId = entityId
    if (dateFrom || dateTo) {
      filter.timestamp = {}
      if (dateFrom) filter.timestamp.$gte = dateFrom
      if (dateTo) filter.timestamp.$lte = dateTo
    }
    return filter
  },

  listPage(params) {
    const { page, limit } = params
    return AuditLog.find(this.buildFilter(params))
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'fullName email roleId')
      .lean()
  },

  count(params) {
    return AuditLog.countDocuments(this.buildFilter(params))
  },

  // An export is not a page: it must not be held in memory in full, because
  // the answer to "everything that happened last quarter" is measured in
  // hundreds of thousands of rows. A cursor lets the CSV be written as it is
  // read. `batchSize` keeps the round trips from dominating.
  streamAll(params) {
    return AuditLog.find(this.buildFilter(params))
      .sort({ timestamp: -1 })
      .populate('actor', 'fullName email')
      .lean()
      .cursor({ batchSize: 500 })
  },

  // Powers the action filter's dropdown. There are ~70 action names and they
  // only change when code does, so the distinct scan is cheap and always
  // reflects what is actually in the log rather than a hand-kept list.
  distinctActions() {
    return AuditLog.distinct('action')
  },
}
