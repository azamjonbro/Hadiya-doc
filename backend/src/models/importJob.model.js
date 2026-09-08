import { Schema, model } from 'mongoose'

export const IMPORT_STATUS = ['DRY_RUN', 'COMMITTED', 'EXPIRED']

/**
 * The result of parsing one uploaded spreadsheet, held between the dry run
 * and the commit.
 *
 * The two steps have to agree on exactly what will be created, and the only
 * way to guarantee that is for the commit to work from the same parsed rows
 * the operator was shown — not from a re-upload of a file that might have
 * been edited in between, and not from a re-parse that might resolve
 * differently because somebody added a department in the meantime.
 *
 * Short-lived on purpose. A parsed import holds every employee's identity
 * details from the file, so it is a copy of the most sensitive data in the
 * system sitting outside the collection that is supposed to own it. Two
 * hours is long enough to look at a 300-row error report and decide; a day
 * would be an archive nobody remembers is there.
 */
const importJobSchema = new Schema(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fileName: { type: String, default: '' },
    status: { type: String, enum: IMPORT_STATUS, default: 'DRY_RUN' },

    // Everything the dry run worked out, kept verbatim so the commit creates
    // precisely what was reviewed.
    rows: { type: [Schema.Types.Mixed], default: [] },
    errors: { type: [Schema.Types.Mixed], default: [] },

    willCreate: { type: Number, default: 0 },
    willUpdate: { type: Number, default: 0 },

    committedAt: { type: Date, default: null },
    createdCount: { type: Number, default: 0 },
    updatedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// Two hours. TTL rather than a cleanup job: the expiry *is* the feature, and
// a job that stops running would leave the copies behind silently.
importJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 60 * 60 })
importJobSchema.index({ createdBy: 1, createdAt: -1 })

export const ImportJob = model('ImportJob', importJobSchema)
