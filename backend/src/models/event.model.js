import { Schema, model } from 'mongoose'

/**
 * A scheduled thing people attend — a meeting, a training session, a
 * seminar.
 *
 * Until 6.1 it was a title, a time and a flat `participants` array, which
 * can express "these people were invited" and nothing else: not who turned
 * up, not that the room holds twelve, not that the session is online and
 * here is the link. Attendance and capacity therefore live in
 * `eventRegistration` — one row per person, which is also what a waiting
 * list needs (AT-31).
 *
 * `participants` stays. It is the invitation list, distinct from the
 * registration list: being invited and having a seat are different facts,
 * and conflating them is what makes a capacity limit unenforceable.
 */
const meetingSchema = new Schema(
  {
    provider: { type: String, enum: ['', 'ZOOM', 'MEET', 'TEAMS', 'OTHER'], default: '' },
    url: { type: String, default: '' },
    // Kept out of the URL because a meeting id and a passcode are routinely
    // shared separately, and pasting a passcode into a link people forward
    // is how an internal session ends up open.
    meetingId: { type: String, default: '' },
    passcode: { type: String, default: '' },
  },
  { _id: false }
)

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['MEETING', 'TRAINING', 'SEMINAR', 'EVENT', 'ANNOUNCEMENT'], required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    location: { type: String, default: '' },
    participants: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },

    // --- 6.1 ---

    mode: { type: String, enum: ['OFFLINE', 'ONLINE', 'HYBRID'], default: 'OFFLINE' },
    meeting: { type: meetingSchema, default: () => ({}) },
    // Who runs it, as opposed to `createdBy`, who put it in the calendar.
    trainerIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },

    // 0 means unlimited. Above 0, registrations past it go on the waiting
    // list rather than being refused (AT-31).
    capacity: { type: Number, min: 0, default: 0 },
    // A denormalised count of REGISTERED rows. Kept because the catalog
    // renders "7 of 12" for every event on the page and counting per row
    // would be one query each; corrected from the rows on every change, so
    // it can drift by at most one write.
    registeredCount: { type: Number, min: 0, default: 0 },

    // When false the event is informational — a company announcement nobody
    // signs up for — and capacity and the waiting list do not apply.
    requiresRegistration: { type: Boolean, default: false },

    // Minutes before the start at which to remind registered people. A list
    // because "a day before and again an hour before" is the normal ask.
    remindBeforeMinutes: { type: [Number], default: [] },
    // Dedup markers per offset, so the reminder job does not re-send the
    // 60-minute reminder every time it runs inside that hour.
    remindersSentFor: { type: [Number], default: [] },

    // The course this session belongs to, if any — an in-person day that is
    // part of a blended course.
    linkedCourseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },

    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'], default: 'PUBLISHED' },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

eventSchema.index({ startAt: 1 })
eventSchema.index({ status: 1, startAt: 1 })
// The reminder sweep reads exactly this: published events starting soon.
eventSchema.index({ status: 1, startAt: 1, remindBeforeMinutes: 1 })

export const Event = model('Event', eventSchema)
