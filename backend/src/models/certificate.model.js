import { Schema, model } from 'mongoose'

export const CERTIFICATE_SOURCE_TYPES = ['COURSE', 'PATH', 'EVENT', 'MANUAL']

/**
 * A certificate that was issued, and the facts it recorded when it was.
 *
 * The learner's name and the course title are copied onto the row rather
 * than joined at render time. That is not denormalisation for speed: a
 * certificate states what was true on the day it was earned, and a course
 * renamed two years later must not silently rewrite everyone's certificate.
 * The same reason the issued PDF is stored rather than regenerated.
 */
const certificateSchema = new Schema(
  {
    serial: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // What was completed. `sourceType` is here from the start because paths
    // (Blok 5) and events (Blok 6) issue certificates too, and retrofitting
    // it would mean migrating live serials.
    sourceType: { type: String, enum: CERTIFICATE_SOURCE_TYPES, required: true },
    sourceId: { type: Schema.Types.ObjectId, default: null },

    templateId: { type: Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null },

    // Copied at issue time. See above.
    fullName: { type: String, required: true },
    sourceTitle: { type: String, required: true },
    score: { type: String, default: '' },

    issuedAt: { type: Date, default: Date.now },
    validUntil: { type: Date, default: null },

    // Filled by the render job. Null while it is queued — the record exists
    // first so the issue is idempotent even if rendering fails and retries.
    pdfKey: { type: String, default: null },

    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedReason: { type: String, default: '' },
  },
  { timestamps: true }
)

/**
 * One live certificate per person per thing (AT-11).
 *
 * Partial on `revokedAt: null` so a revoked certificate does not block a
 * re-issue — which is exactly what happens when a course reopens, is
 * finished again, and deserves a fresh one. The index is what makes the
 * issue idempotent under a retrying job rather than a check-then-write that
 * two workers can both pass.
 */
certificateSchema.index(
  { userId: 1, sourceType: 1, sourceId: 1 },
  { unique: true, partialFilterExpression: { revokedAt: null } }
)
certificateSchema.index({ userId: 1, issuedAt: -1 })
// The expiry sweep and the "expiring soon" reminder both read this.
certificateSchema.index({ validUntil: 1 }, { partialFilterExpression: { revokedAt: null } })

export const Certificate = model('Certificate', certificateSchema)
