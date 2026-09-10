import { Schema, model } from 'mongoose'

/**
 * A report too big to build inside an HTTP request.
 *
 * The synchronous export caps at 5 000 rows because somebody is waiting on
 * the response. An export of the whole company is a legitimate thing to
 * want, so it becomes a job: the file is built by the worker, stored, and
 * the requester is told when it is ready.
 *
 * The row cap does not disappear — an unbounded export on a shared box is a
 * way to run it out of memory — it just moves to a number nobody is
 * watching a spinner for.
 */
const exportJobSchema = new Schema(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    format: { type: String, enum: ['csv', 'xlsx'], default: 'xlsx' },
    lang: { type: String, enum: ['uz', 'ru', 'en'], default: 'uz' },
    // The filters as sent. Stored so the file can be rebuilt, and so
    // "what exactly did this export contain" is answerable later.
    filters: { type: Schema.Types.Mixed, default: () => ({}) },

    // The requester's scope, resolved when the job was queued rather than
    // when it runs. A job must export what the person could see when they
    // asked — not what they can see by the time the worker gets to it,
    // which may be more.
    scopedUserIds: { type: [Schema.Types.ObjectId], default: null },

    /**
     * Extra people to tell when it is ready, beyond the requester.
     *
     * Only a scheduled report fills this in (8.4): nobody is at a keyboard
     * when it runs, so the audience is the schedule's, while the *data* is
     * still the schedule owner's — `scopedUserIds` above decides what is in
     * the file, and this decides who is told the file exists. Being told is
     * not being able to open it: the download goes through the same
     * ownership check as any other export.
     */
    notify: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'ScheduledReport', default: null },

    status: { type: String, enum: ['QUEUED', 'RUNNING', 'READY', 'FAILED'], default: 'QUEUED' },
    rowCount: { type: Number, default: 0 },
    totalRows: { type: Number, default: 0 },
    truncated: { type: Boolean, default: false },

    // Key in the private materials bucket. Served through a short-lived
    // signed URL, never as a public link: an export of the staff list is
    // exactly the file that must not be shareable by URL.
    fileKey: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    error: { type: String, default: '' },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    // Files are swept after this. An export is a snapshot somebody wanted
    // once; keeping every one of them forever fills a bucket with stale
    // copies of the staff list.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
)

exportJobSchema.index({ requestedBy: 1, createdAt: -1 })
exportJobSchema.index({ status: 1 })
// TTL on the document. The stored file is removed by the worker before the
// row disappears — see exportQueue.js.
exportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const ExportJob = model('ExportJob', exportJobSchema)
