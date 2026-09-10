import { Schema, model } from 'mongoose'

/**
 * A subscription: "tell this URL when that happens" (11.2).
 *
 * The other half of 11.1. A key lets another system ask us questions; a
 * webhook means it does not have to ask. An HR system polling
 * `/api/public/v1/assignments?completedSince=` every minute to notice one
 * completion an hour is most of what both sides spend, and the completion
 * still arrives up to a minute late.
 *
 * **The signing secret is stored in plaintext, unlike an API key's hash.**
 * That is not an oversight and the asymmetry is the point: a key is
 * something we *verify* (a hash suffices, and is strictly better), while a
 * signature is something we *produce* — HMAC needs the secret itself at
 * every send. What limits the damage instead is that the secret authorises
 * nothing here: leaked, it lets someone forge deliveries *to the
 * receiver*, not read anything from us. It is shown once at creation and
 * rotatable in place.
 */
const webhookSchema = new Schema(
  {
    // "Bitrix HR sync", "Ops Slack channel". Same reason a key has one:
    // six months later this is the only clue what it was for.
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    secret: { type: String, required: true },

    /**
     * Which events this endpoint wants, from the closed catalogue in
     * `webhookEvents.js`.
     *
     * No wildcard. An endpoint subscribed to "everything" would silently
     * start receiving events invented after it was written, and the first
     * anyone hears of it is a receiver crashing on a payload it has no
     * branch for.
     */
    events: { type: [String], default: [] },

    /**
     * Extra headers the receiver needs — a gateway token, a tenant id.
     *
     * Not a substitute for the signature: this is for getting *through* to
     * the receiver, while the HMAC is how the receiver knows it was us.
     */
    headers: { type: Map, of: String, default: () => new Map() },

    active: { type: Boolean, default: true },

    /**
     * Consecutive failures, and the automatic stop.
     *
     * A receiver that has been dead for a week does not need us to keep
     * trying: every event queues five attempts that will all fail, and the
     * delivery log fills with them until the real failures are unfindable.
     * Reset on any success, so an endpoint with an occasional bad day never
     * approaches the threshold.
     */
    consecutiveFailures: { type: Number, default: 0 },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, default: '' },

    lastDeliveryAt: { type: Date, default: null },
    lastStatus: { type: Number, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

// The dispatch query: every active subscription for one event name.
webhookSchema.index({ active: 1, events: 1 })

export const Webhook = model('Webhook', webhookSchema)
