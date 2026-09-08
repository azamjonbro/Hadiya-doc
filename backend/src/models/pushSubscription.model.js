import { Schema, model } from 'mongoose'

/**
 * One browser's permission to be pushed to.
 *
 * A person has as many of these as they have browsers — a work laptop, a
 * phone, a machine they used once in a training room — and each is issued by
 * the browser vendor's push service, not by us. We cannot create one, only
 * store what the browser hands over and stop using it when the vendor says
 * it is gone.
 */
const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // The vendor's URL for this browser. Unique across everyone, not per
    // user: the same endpoint arriving for a second account means the
    // browser changed hands, and the subscription must follow the person
    // sitting at it rather than be duplicated.
    endpoint: { type: String, required: true, unique: true },

    // The browser's own encryption keys. Every push is encrypted to these,
    // so the vendor relaying it cannot read the notification.
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },

    // Which browser this is, so the settings screen can say "Chrome on
    // Windows" rather than list four identical rows.
    userAgent: { type: String, default: '' },

    lastSuccessAt: { type: Date, default: null },
    // Successive failures that were not a hard 404/410. A browser that is
    // merely offline should not lose its subscription, but one that has
    // failed repeatedly for other reasons is worth pruning eventually.
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// "Push everything for this person" is the only query that runs per
// notification.
pushSubscriptionSchema.index({ userId: 1, createdAt: -1 })

export const PushSubscription = model('PushSubscription', pushSubscriptionSchema)
