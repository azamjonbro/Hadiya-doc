import { Schema, model } from 'mongoose'
import { CONTENT_KINDS, registerContentModel } from '../services/courses/contentItem.js'

/**
 * A SCORM package: content authored somewhere else, run here (9.3).
 *
 * The fifth kind of content a topic can hold, and the only one the platform
 * does not understand the inside of. A Storyline or iSpring export is a
 * small website plus a contract — `imsmanifest.xml` says where to start, and
 * the content talks to us through the SCORM runtime API to report how far
 * the learner got. So this row holds two different things: where the files
 * are, and what the manifest promised.
 *
 * Files are not stored in the row. They are extracted to
 * `<packageId>/...` in the SCORM bucket and served back through the API,
 * because a package expects to load its own relative assets and there is no
 * way to rewrite the hundreds of URLs inside it.
 */
const scormPackageSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // '1.2' or '2004'. Read from the manifest, not from the uploader: the
    // two versions disagree about what "complete" means and about half the
    // data model, and guessing wrong makes a package that reports nothing.
    version: { type: String, enum: ['1.2', '2004'], default: '1.2' },

    // The zip as uploaded. Kept after extraction on purpose: it is the only
    // artefact that can be re-extracted if a later version of the extractor
    // reads a manifest better, and re-uploading a 300 MB course to fix our
    // own bug is not a repair anybody should have to do.
    zipKey: { type: String, default: '' },
    // Prefix the extracted files live under, inside S3_BUCKET_SCORM.
    baseKey: { type: String, default: '' },
    // Path of the launch file, relative to baseKey, from the manifest.
    launchHref: { type: String, default: '' },
    // The manifest's own identifier, for support questions ("which export
    // is this?") — never used as a key.
    manifestIdentifier: { type: String, default: '' },
    // <adlcp:masteryscore> / passing score, 0-100. Null when the package
    // does not state one, in which case any reported completion counts.
    masteryScore: { type: Number, default: null },

    // Extraction is a background job, so a package has a lifecycle rather
    // than just existing. FAILED keeps the reason: "the upload did nothing"
    // is the least useful thing an author can be told.
    processingStatus: {
      type: String,
      enum: ['PENDING', 'EXTRACTING', 'READY', 'FAILED'],
      default: 'PENDING',
    },
    processingError: { type: String, default: '' },
    fileCount: { type: Number, default: 0 },
    totalBytes: { type: Number, default: 0 },

    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

scormPackageSchema.index({ topicId: 1, order: 1 })
scormPackageSchema.index({ courseId: 1 })

export const ScormPackage = model('ScormPackage', scormPackageSchema)

// Same reasoning as the Lesson model (9.1): registered next to the model so
// every code path that can touch the collection has registered it, and
// `nextOrder()` counts across all five collections however the services
// happen to be imported.
registerContentModel(CONTENT_KINDS.SCORM, ScormPackage)
