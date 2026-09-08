import { Schema, model } from 'mongoose'

// Where a field is drawn, as a fraction of the page rather than in points.
// A template designed against an A4 landscape background has to survive the
// operator swapping in an A5 one, and percentages are the only coordinates
// that do.
const fieldSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      enum: ['fullName', 'courseTitle', 'issuedAt', 'serial', 'score', 'validUntil', 'qr'],
    },
    x: { type: Number, required: true, min: 0, max: 100 },
    y: { type: Number, required: true, min: 0, max: 100 },
    fontSize: { type: Number, default: 16, min: 6, max: 96 },
    bold: { type: Boolean, default: false },
    align: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
    color: { type: String, default: '#111111' },
    // QR only: how big the square is, again as a share of the page width.
    size: { type: Number, default: 12, min: 4, max: 40 },
  },
  { _id: false }
)

/**
 * The design of a certificate: a background image and where the text goes.
 *
 * Deliberately not a document format. HR wants to hand over a JPEG they had
 * made and then nudge the name two centimetres left, and every attempt to
 * express that as a .docx template ends up asking them to edit XML. A
 * background plus positioned fields is what the position editor in 3.3
 * manipulates directly.
 */
const certificateTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Key in the images bucket. Optional: a template with no background
    // renders on plain paper, which is a legitimate starting point rather
    // than a broken state.
    backgroundKey: { type: String, default: '' },
    orientation: { type: String, enum: ['landscape', 'portrait'], default: 'landscape' },
    pageSize: { type: String, default: 'A4' },
    fields: { type: [fieldSchema], default: [] },

    // How long a certificate issued from this template is good for. 0 means
    // it does not expire — compliance training usually does, an onboarding
    // certificate usually does not.
    validityDays: { type: Number, default: 0, min: 0 },

    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export const CertificateTemplate = model('CertificateTemplate', certificateTemplateSchema)
