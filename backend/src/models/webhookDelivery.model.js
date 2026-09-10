import { Schema, model } from 'mongoose'

/**
 * One attempt-tracked delivery of one event to one endpoint (11.2).
 *
 * Written **before** the send, not after it, and that ordering is the whole
 * value of the row: a delivery whose HTTP call never returns still exists
 * as PENDING, so "we tried and something went wrong" is distinguishable
 * from "we never tried". A log written after the fact records only the
 * failures the process survived.
 *
 * The row is also the answer to the only interesting support question a
 * webhook produces — "we didn't get it" — which is unanswerable without the
 * status the receiver actually returned. Hence `responseStatus` and a
 * clipped `responseBody`: a receiver's error page is usually the reason.
 */
const webhookDeliverySchema = new Schema(
  {
    webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
    event: { type: String, required: true },

    /**
     * The exact payload that was signed.
     *
     * Stored rather than rebuilt on replay: the point of a replay is to
     * resend *what the receiver missed*, and a payload rebuilt from
     * today's data would be a different event wearing the same id. Mixed
     * type because each event has its own shape.
     */
    payload: { type: Schema.Types.Mixed, required: true },
    occurredAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ['PENDING', 'DELIVERED', 'FAILED'],
      default: 'PENDING',
    },
    attempts: { type: Number, default: 0 },
    responseStatus: { type: Number, default: null },
    // Clipped to a couple of hundred characters: enough to see "502 Bad
    // Gateway" or a validation message, not enough for a receiver's HTML
    // error page to become the largest collection in the database.
    responseBody: { type: String, default: '' },
    error: { type: String, default: '' },
    durationMs: { type: Number, default: null },
    deliveredAt: { type: Date, default: null },

    // Set when this delivery is a manual resend of another one, so a
    // duplicate at the receiver can be explained rather than investigated.
    replayOf: { type: Schema.Types.ObjectId, ref: 'WebhookDelivery', default: null },
  },
  { timestamps: true }
)

// The delivery log for one endpoint, newest first — the screen an operator
// opens when a receiver reports a gap.
webhookDeliverySchema.index({ webhookId: 1, createdAt: -1 })
// Deliveries are diagnostics with a short useful life. Thirty days, expired
// by Mongo rather than by a sweep of ours: there is no cleanup job to fail
// silently, and no one-off script anybody has to remember to run.
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })

export const WebhookDelivery = model('WebhookDelivery', webhookDeliverySchema)
