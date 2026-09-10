import { Schema, model } from 'mongoose'

/**
 * One verdict on one checklist item, by name and by clock (13.3).
 *
 * The session already carries the result of each item for display. This
 * collection is the record behind it: who said so, when, and what they
 * wrote. Keeping both is deliberate — the denormalised copy makes the
 * observer's form one read on a phone with one bar of signal, and this row
 * is what survives to be read back in an investigation.
 *
 * **Unique on (sessionId, itemId), and written as an upsert.** Two things
 * fall out of that, both wanted:
 *
 *   - changing your mind about an item overwrites the verdict rather than
 *     appending a second one, so the session has exactly one answer per
 *     item and the arithmetic cannot double-count;
 *   - recording is *idempotent*, which is what makes it safe to put through
 *     the offline queue (12.3) — a request replayed after a lift or a
 *     basement lands on the same row and changes nothing.
 */
const ojtObservationSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'OjtSession', required: true },
    // The checklist item's id, as copied onto the session. Not a path into
    // the checklist document: the item may have been edited or deleted
    // there since, and this row still has to mean something.
    itemId: { type: Schema.Types.ObjectId, required: true },

    /**
     * NOT_OBSERVED is a real answer, not a missing one.
     *
     * A shift does not always throw up every situation on the list — nobody
     * called for an emergency stop this afternoon. Scoring that as a fail
     * would punish the trainee for the day's work, and scoring it as a pass
     * would be an invention; it is excluded from the fraction instead.
     */
    result: { type: String, enum: ['PASS', 'FAIL', 'NOT_OBSERVED'], required: true },
    note: { type: String, default: '' },

    observedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    observedAt: { type: Date, default: Date.now },
    // When the phone recorded it, as opposed to when the server heard it.
    // Sent by the offline form so a verdict given at 09:40 in a basement
    // does not read as 11:15 in the car park.
    recordedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

ojtObservationSchema.index({ sessionId: 1, itemId: 1 }, { unique: true })

export const OjtObservation = model('OjtObservation', ojtObservationSchema)
