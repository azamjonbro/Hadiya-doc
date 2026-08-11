import { Schema, model } from 'mongoose'

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'timestamp', updatedAt: false } }
)

auditLogSchema.index({ actor: 1, timestamp: -1 })
auditLogSchema.index({ entity: 1, entityId: 1 })

export const AuditLog = model('AuditLog', auditLogSchema)
