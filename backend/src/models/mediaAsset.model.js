import { Schema, model } from 'mongoose'

/**
 * One file in the media library (9.5).
 *
 * Object storage has no idea what a file is for. It holds a key, some bytes
 * and a date — so "which images does this company have", "where is this one
 * used" and "is anything still pointing at it" were all unanswerable, and
 * the only safe answer to "can this be deleted" was no. This row is the
 * answer: the library lists these, not the bucket.
 *
 * It is deliberately a *registry* rather than the truth. The bytes live in
 * S3 and the references live in the collections that use them; a row here
 * can go missing (an upload that raced a failure) without breaking either,
 * and the orphan sweep reconciles the three (mediaCleanup.service.js).
 */
const mediaAssetSchema = new Schema(
  {
    // The object key inside `bucket` — unique, because the same key twice
    // would mean two library entries for one file, and deleting one would
    // pull the bytes out from under the other.
    key: { type: String, required: true, unique: true },
    bucket: { type: String, required: true },
    // The public URL as stored by whatever uses it. Kept alongside the key
    // because the fields that reference images (course cover, news image,
    // a lesson's IMAGE block) hold URLs, not keys, and the usage lookup has
    // to match on what is actually written there.
    url: { type: String, default: '' },
    kind: { type: String, enum: ['IMAGE'], default: 'IMAGE' },
    // The uploaded filename, for a human to recognise. Never used to build
    // a key — that stays server-generated (imageUpload.service.js).
    name: { type: String, default: '' },
    // A plain string, not a tree of documents: folders here are labels an
    // author types ("brand", "brand/2026"), and a nested collection would
    // buy nothing but joins.
    folder: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

mediaAssetSchema.index({ folder: 1, createdAt: -1 })
mediaAssetSchema.index({ name: 'text' })

export const MediaAsset = model('MediaAsset', mediaAssetSchema)
