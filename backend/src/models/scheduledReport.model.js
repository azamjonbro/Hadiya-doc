import { Schema, model } from 'mongoose'

/**
 * A report that builds itself on a timetable (8.4).
 *
 * The thing being scheduled is an export, not a delivery: the sweep creates
 * the same ExportJob a person would have queued by hand (8.3), and the
 * recipients are told it is ready. The file is never attached to an email
 * and never handed out as a permanent URL — an export of the staff list is
 * exactly the file that must stay behind a login, and a signed link that had
 * to survive in an inbox would be a link that outlives the reason it was
 * sent.
 */
const scheduledReportSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    type: { type: String, required: true },
    // csv/xlsx only — the same two the worker can write.
    format: { type: String, enum: ['csv', 'xlsx'], default: 'xlsx' },
    lang: { type: String, enum: ['uz', 'ru', 'en'], default: 'uz' },
    filters: { type: Schema.Types.Mixed, default: () => ({}) },

    cadence: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY'], default: 'WEEKLY' },
    // Local hour in APP_TIMEZONE. A report that arrives at 03:00 because the
    // server thinks in UTC is a report nobody reads with their morning.
    hour: { type: Number, min: 0, max: 23, default: 7 },
    // 0 = Sunday, matching Date#getDay. Weekly only.
    dayOfWeek: { type: Number, min: 0, max: 6, default: 1 },
    /**
     * Monthly only, and capped at 28 on purpose.
     *
     * "The 31st" is a date that does not exist in five months of the year,
     * and every way of handling that is a surprise: skip it and the report
     * silently misses February, clamp it and "the 31st" quietly means the
     * 28th. Refusing to store it is the only version where the person
     * choosing the day finds out at the time they choose it.
     */
    dayOfMonth: { type: Number, min: 1, max: 28, default: 1 },

    /**
     * Who is told when it is ready.
     *
     * Accounts, not addresses. A scheduled report reaches the same file the
     * exports panel does, so its audience has to be people the platform can
     * check permissions for — an email address is not something
     * `report:export` can be asked about.
     */
    recipients: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },

    active: { type: Boolean, default: true },
    lastRunAt: { type: Date, default: null },
    lastJobId: { type: Schema.Types.ObjectId, ref: 'ExportJob', default: null },
    lastError: { type: String, default: '' },
    nextRunAt: { type: Date, required: true },
  },
  { timestamps: true }
)

// The sweep's only query: what is due.
scheduledReportSchema.index({ active: 1, nextRunAt: 1 })
scheduledReportSchema.index({ createdBy: 1, createdAt: -1 })

export const ScheduledReport = model('ScheduledReport', scheduledReportSchema)
