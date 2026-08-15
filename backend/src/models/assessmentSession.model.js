import { Schema, model } from 'mongoose'

/**
 * One live sitting of a module test.
 *
 * The 15-minute limit and the tab-switch rule are only real if the server
 * owns them: a countdown that lives in the browser is reset by a reload,
 * and a `visibilitychange` handler is removed from the devtools console in
 * a second. So the deadline is stamped here at start time, submissions are
 * validated against it, and focus losses are counted server-side.
 *
 * A session is separate from AssessmentAttempt because an attempt is the
 * *result* (score, passed, points) — it only exists once the sitting ends,
 * whereas this row exists for as long as someone is mid-test.
 */
const assessmentSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    startedAt: { type: Date, required: true },
    // Stamped once, at start. Never recomputed from "now", so reloading the
    // page resumes the same countdown instead of restarting it.
    expiresAt: { type: Date, required: true },
    // Incremented every time the client reports the test tab losing focus.
    focusLossCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'SUBMITTED', 'TERMINATED'],
      default: 'IN_PROGRESS',
    },
    // Why the sitting ended, when it did not end with a normal submit.
    endedReason: {
      type: String,
      enum: ['', 'TIME_EXPIRED', 'FOCUS_LOST', 'ABANDONED'],
      default: '',
    },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// The "is this user already sitting this test?" lookup, on every start.
assessmentSessionSchema.index({ userId: 1, assessmentId: 1, status: 1 })

export const AssessmentSession = model('AssessmentSession', assessmentSessionSchema)
