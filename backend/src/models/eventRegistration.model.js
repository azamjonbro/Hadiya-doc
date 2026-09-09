import { Schema, model } from 'mongoose'

/**
 * One person's seat at one event.
 *
 * A row per person rather than an array on the event, because this is where
 * the facts that differ per person live: whether they have a seat or a
 * place in the queue, when they registered, whether they turned up, and who
 * marked them present. An array cannot carry any of that, and a waiting
 * list needs an order.
 *
 * WAITLIST rows keep their `waitlistPosition` so the queue survives a
 * restart and so "you are third" is answerable without recomputing from
 * timestamps every time somebody asks.
 */
const eventRegistrationSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: ['REGISTERED', 'WAITLIST', 'CANCELLED', 'ATTENDED', 'NO_SHOW'],
      default: 'REGISTERED',
    },
    registeredAt: { type: Date, default: Date.now },

    // Only meaningful on a WAITLIST row. 1 is next in line.
    waitlistPosition: { type: Number, default: 0 },

    attendedAt: { type: Date, default: null },
    // Attendance is somebody's assertion, not an automatic fact, so it
    // records who asserted it.
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

// One registration per person per event. Registering twice would take two
// seats out of a capacity of twelve.
eventRegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true })
eventRegistrationSchema.index({ eventId: 1, status: 1, waitlistPosition: 1 })
eventRegistrationSchema.index({ userId: 1, status: 1 })

export const EventRegistration = model('EventRegistration', eventRegistrationSchema)
