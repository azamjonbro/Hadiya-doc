import { Schema, model } from 'mongoose'

export const EXTERNAL_CERTIFICATE_STATUS = ['PENDING', 'APPROVED', 'REJECTED']

/**
 * A qualification earned somewhere else — a fire-safety card, a driving
 * licence, a vendor exam — recorded against the employee.
 *
 * Kept apart from `Certificate` on purpose. Ours is evidence the platform
 * produced and can verify; this is a claim somebody typed in with a photo
 * attached, and merging the two would let an unverified upload appear in a
 * compliance report as though the platform had issued it. It carries an
 * approval state for the same reason.
 */
const externalCertificateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    issuer: { type: String, default: '', trim: true },
    // The issuer's own number, as printed. Free text: every issuer has its
    // own shape and validating them would only reject the real ones.
    externalSerial: { type: String, default: '', trim: true },

    issuedAt: { type: Date, default: null },
    validUntil: { type: Date, default: null },

    // Scan or photo, in the materials bucket — private, served only through
    // a short-lived signed URL like every other document.
    fileKey: { type: String, default: '' },

    status: { type: String, enum: EXTERNAL_CERTIFICATE_STATUS, default: 'PENDING' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
)

externalCertificateSchema.index({ userId: 1, createdAt: -1 })
externalCertificateSchema.index({ status: 1, createdAt: -1 })
externalCertificateSchema.index({ validUntil: 1 })

export const ExternalCertificate = model('ExternalCertificate', externalCertificateSchema)
