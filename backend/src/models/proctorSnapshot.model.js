import { Schema, model } from 'mongoose'

/**
 * A webcam frame kept because someone other than the learner appeared during a
 * monitored lesson.
 *
 * The image itself lives in the proctor bucket, which stays private — only the
 * `key` is stored here, and the bytes are served through an admin-only
 * endpoint rather than a URL anyone could pass around. These are photographs
 * of people, so they expire on the same 180-day clock as the raw analytics
 * events they belong to; nothing here is meant to be kept indefinitely.
 */
const proctorSnapshotSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    sessionId: { type: String, required: true },
    // ATTENTION_REASONS.MULTIPLE_FACES or UNKNOWN_FACE.
    reason: { type: String, required: true },
    // How many faces the model saw, so a reviewer can tell "a second person
    // walked past" from "the learner left and someone else sat down".
    faceCount: { type: Number, default: null },
    // Object key in the proctor bucket. Never a URL.
    key: { type: String, required: true },
    contentType: { type: String, default: 'image/jpeg' },
    // Playback position the frame was taken at, so it can be lined up with
    // the rest of the session timeline.
    position: { type: Number, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

proctorSnapshotSchema.index({ userId: 1, videoId: 1, createdAt: -1 })
// Same retention as VideoAnalyticsEvent (180 days). Photographs of employees
// are not something to accumulate forever, and an alert nobody looked at
// inside six months is not going to be looked at.
proctorSnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 })

export const ProctorSnapshot = model('ProctorSnapshot', proctorSnapshotSchema)
