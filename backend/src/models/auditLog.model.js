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
// The audit view's default query is "everything, newest first", narrowed by
// action — the two other shapes it is read in.
auditLogSchema.index({ timestamp: -1 })
auditLogSchema.index({ action: 1, timestamp: -1 })

// Two years. Long enough to answer an incident question about last year's
// hiring season, short enough that the collection cannot grow without bound
// on a box that also hosts other sites. Mongo's TTL monitor deletes on the
// `timestamp` field, so entries expire on their own without a cleanup job.
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 730 * 24 * 60 * 60 })

export const AuditLog = model('AuditLog', auditLogSchema)
