import { AuditLog } from '../models/auditLog.model.js'

export const auditLogRepository = {
  record({ actor = null, action, entity, entityId = null, metadata = {}, ip = '', userAgent = '' }) {
    return AuditLog.create({ actor, action, entity, entityId, metadata, ip, userAgent })
  },
}
