import { Schema, model } from 'mongoose'

// Single model for FILE / PRESENTATION / MULTIMEDIA — they share identical
// storage/access mechanics (upload -> private bucket -> signed download URL)
// and differ only in allowed mimetypes (enforced at upload time) and the
// admin UI label/icon, so one collection with a `type` discriminator avoids
// three near-identical models.
const materialSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    type: { type: String, enum: ['FILE', 'PRESENTATION', 'MULTIMEDIA'], required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // S3 object key in S3_BUCKET_MATERIALS (private bucket) — never derived
    // from the client filename, same path-traversal rule as images/videos.
    key: { type: String, required: true },
    originalFilename: { type: String, default: '' },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    // Whether the download button exists at all (7.5). Default true — most
    // material is meant to be kept, and flipping the default would silently
    // lock every existing document.
    //
    // Deliberately not DRM. It removes the download button and refuses the
    // `attachment` URL; it cannot stop somebody who can read a file from
    // keeping it — screenshots, the browser cache and a phone camera all
    // still exist. What it does is make "please don't circulate this" an
    // enforced default rather than a note in the description.
    allowDownload: { type: Boolean, default: true },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

materialSchema.index({ topicId: 1, order: 1 })
materialSchema.index({ courseId: 1 })

export const Material = model('Material', materialSchema)
