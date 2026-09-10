import { Schema, model } from 'mongoose'

/**
 * A key that lets another system read from this one (11.1).
 *
 * Not a user account with a long password. The distinction matters in three
 * places: a key carries an explicit, narrow list of scopes rather than a
 * role; it has its own request budget, because an integration polling every
 * minute is normal traffic and would look like abuse on a person's limiter;
 * and it can be revoked without touching anybody's login.
 *
 * **The secret is never stored.** What is stored is `prefix` (public, and
 * how the key is looked up) and an argon2 hash of the whole key — the same
 * treatment a password gets, for the same reason: a leaked database must not
 * hand over working credentials. The full key is shown once, at creation,
 * and cannot be recovered afterwards.
 */
const apiKeySchema = new Schema(
  {
    // What it is for, in a person's words: "HR sync", "BI dashboard". The
    // first question about a key nobody recognises is what it was for.
    name: { type: String, required: true, trim: true },
    // The public half, `lms_ab12cd34`. Indexed and unique: it is the
    // lookup, so a collision would make one key shadow another.
    prefix: { type: String, required: true, unique: true },
    hash: { type: String, required: true },

    /**
     * Platform permissions, not a role.
     *
     * The same strings `requirePermission` checks, so a public route is
     * gated by exactly the middleware a private one is — one implementation
     * of "may this caller do that", whichever door they came through.
     */
    scopes: { type: [String], default: [] },

    /**
     * Whether user payloads may carry identifiers (JSHSHIR).
     *
     * Off by default and separate from the scopes, because "may read the
     * employee list" and "may read everybody's national identifier" are
     * different decisions — and the second one is the one that appears in a
     * data-protection conversation. An HR sync needs it; a dashboard
     * counting completions does not.
     */
    includePii: { type: Boolean, default: false },

    // Per-minute budget for this key alone (11.1). An integration that
    // polls every minute is normal; one that polls every second is a bug
    // in somebody's cron.
    rateLimitPerMinute: { type: Number, min: 1, max: 6000, default: 60 },

    // Optional expiry. A key with an end date is a key somebody has to
    // think about again, which is the point.
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: '' },
    requestCount: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

apiKeySchema.index({ revokedAt: 1, expiresAt: 1 })

export const ApiKey = model('ApiKey', apiKeySchema)
