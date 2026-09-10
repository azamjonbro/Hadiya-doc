import { Schema, model } from 'mongoose'

/**
 * One named observer watching one named trainee, once (13.3).
 *
 * The items are **copied here**, not joined to the checklist. That is the
 * design decision the rest of the module hangs off:
 *
 *   - a checklist is edited between March and June, and a session finished
 *     in March must still show the wording the observer actually read out;
 *   - a signed-off session is evidence, and evidence whose text can be
 *     changed afterwards by editing another document is not evidence.
 *
 * The copy is refreshed while the session is still SCHEDULED — nothing has
 * been observed yet, so there is no history to protect and the observer
 * should get the current list — and frozen the moment it starts.
 */
const sessionItemSchema = new Schema(
  {
    // The checklist item this was copied from, so a report can still group
    // by item across sessions. Not a populated reference: the copy above it
    // is what gets displayed.
    itemId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    criteria: { type: String, default: '' },
    order: { type: Number, default: 0 },
    required: { type: Boolean, default: true },
    weight: { type: Number, min: 0, default: 1 },
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', default: null },
    competencyLevel: { type: Number, min: 0, default: null },

    // The observation's verdict, denormalised onto the session.
    //
    // The full record — who, when, the note — lives in ojtObservation, one
    // row per item, because that is the audit trail. This field exists so
    // the observer's form and the session list can be drawn with one read:
    // the phone on the shop floor is the worst place to pay for a join.
    result: { type: String, enum: ['PASS', 'FAIL', 'NOT_OBSERVED', null], default: null },
  },
  { _id: false }
)

const ojtSessionSchema = new Schema(
  {
    checklistId: { type: Schema.Types.ObjectId, ref: 'OjtChecklist', required: true },
    // Copied with the items: a renamed checklist must not relabel finished
    // sessions, and the version says which edition this was run against.
    checklistName: { type: String, default: '' },
    checklistVersion: { type: Number, min: 1, default: 1 },
    passThresholdPercent: { type: Number, min: 0, max: 100, default: 80 },

    traineeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // The one person who may record on this session. Recording as somebody
    // else would make the signature a lie, so this is checked on every
    // write rather than being a display field.
    observerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // The trainee's manager at scheduling time, copied for the same reason
    // onboarding copies it: a reorganisation must not orphan the record.
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Where it happened. Free text on purpose — "Sex 3, press 2" is more
    // use to whoever reads this later than a branch id.
    location: { type: String, default: '', trim: true },

    scheduledAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
    },

    items: { type: [sessionItemSchema], default: [] },

    // Computed on completion and stored, not derived on read: the threshold
    // and the weights can both be edited on the checklist afterwards, and a
    // score that moves is not a result.
    score: {
      passed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      notObserved: { type: Number, default: 0 },
      // Weight of everything actually judged (PASS + FAIL). What was not
      // observed is outside the fraction entirely — see the service.
      assessedWeight: { type: Number, default: 0 },
      earnedWeight: { type: Number, default: 0 },
      percent: { type: Number, min: 0, max: 100, default: 0 },
    },
    outcome: { type: String, enum: ['PASS', 'FAIL', null], default: null },

    observerNote: { type: String, default: '' },

    // Sign-off is a separate act from completing. Completing says "I have
    // been through the list"; signing says "and I stand behind it" — and
    // only the second one posts levels to the competency matrix.
    signOff: {
      signedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      signedAt: { type: Date, default: null },
      note: { type: String, default: '' },
      // What the signature actually did to the matrix, kept here so the
      // session can answer "which levels came out of this" without
      // trawling the competency history.
      postedCompetencies: {
        type: [
          {
            _id: false,
            competencyId: { type: Schema.Types.ObjectId, ref: 'Competency' },
            level: { type: Number },
          },
        ],
        default: [],
      },
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

// The observer's own list, which is the screen this module exists for.
ojtSessionSchema.index({ observerId: 1, status: 1, scheduledAt: -1 })
// "What has this person been observed on" — the trainee's record, and the
// scoped list a manager reads.
ojtSessionSchema.index({ traineeId: 1, scheduledAt: -1 })
ojtSessionSchema.index({ checklistId: 1 })

export const OjtSession = model('OjtSession', ojtSessionSchema)
