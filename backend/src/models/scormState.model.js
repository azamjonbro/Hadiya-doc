import { Schema, model } from 'mongoose'

/**
 * One learner's runtime state inside one SCORM package (9.3).
 *
 * SCORM's data model (`cmi.*`) is the content's, not ours: a package writes
 * whatever elements its authoring tool decided to write, and the standard
 * lets it invent `cmi.suspend_data` blobs of any shape. So the whole CMI
 * tree is stored as given, in `cmi`, and only the handful of elements the
 * platform *acts* on are also mirrored into typed fields:
 *
 *   - completion  — whether the course may count this item as done (3.1)
 *   - success     — passed / failed, which is not the same as complete
 *   - score       — for reports, and for the mastery score comparison
 *
 * Mirrored rather than read out of `cmi` on demand because the two SCORM
 * versions name every one of them differently: 1.2 says
 * `cmi.core.lesson_status` with one value covering both completion and
 * success; 2004 splits it into `cmi.completion_status` and
 * `cmi.success_status`. Normalising once, on write, keeps that translation
 * in one place instead of in every reader (see scormRuntime.service.js).
 *
 * `suspendData` and `location` are what make resume work — the content asks
 * for them back on its next Initialize and continues where it stopped.
 */
const scormStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    packageId: { type: Schema.Types.ObjectId, ref: 'ScormPackage', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },

    // The raw CMI tree, flat: keys are element names ('cmi.core.score.raw'),
    // values are strings, because that is what the API contract says every
    // value is. A nested object would look tidier and would force a
    // translation on every read and write.
    cmi: { type: Schema.Types.Mixed, default: {} },

    completionStatus: {
      type: String,
      enum: ['unknown', 'not attempted', 'incomplete', 'completed'],
      default: 'unknown',
    },
    successStatus: { type: String, enum: ['unknown', 'passed', 'failed'], default: 'unknown' },
    scoreRaw: { type: Number, default: null },
    scoreMin: { type: Number, default: null },
    scoreMax: { type: Number, default: null },
    // Seconds. SCORM reports time as a formatted string in two different
    // formats depending on version; stored as a number so a report can add
    // it up without parsing anything.
    totalTimeSeconds: { type: Number, default: 0 },

    location: { type: String, default: '' },
    suspendData: { type: String, default: '' },
    // Why the last session ended, as the content declared it: 'suspend'
    // means "I will be back", and a resume must honour that.
    exitMode: { type: String, default: '' },

    attempts: { type: Number, default: 0 },
    firstAccessAt: { type: Date, default: null },
    lastAccessAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

scormStateSchema.index({ userId: 1, packageId: 1 }, { unique: true })
scormStateSchema.index({ courseId: 1, userId: 1 })

export const ScormState = model('ScormState', scormStateSchema)
