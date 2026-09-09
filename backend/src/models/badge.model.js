import { Schema, model } from 'mongoose'

/**
 * A badge somebody can earn.
 *
 * Until 7.4 badges were five hard-coded rules recomputed on every read
 * (`gamification/badgeDefinitions.js`). That works exactly until somebody
 * wants a sixth — which needs a deploy — or asks when a badge was earned,
 * which nothing recorded.
 *
 * `criteria` is a declared rule rather than a function, because a function
 * cannot be stored and cannot be written by an administrator. The set of
 * metrics is deliberately small and closed: an expression language here
 * would be a second, worse query engine that nobody can validate.
 */
const criterionSchema = new Schema(
  {
    metric: {
      type: String,
      enum: [
        'VIDEOS_COMPLETED',
        'COURSES_COMPLETED',
        'QUIZZES_PASSED',
        'TOTAL_POINTS',
        'CERTIFICATES_EARNED',
        'PATHS_COMPLETED',
        'PERFECT_QUIZZES',
      ],
      required: true,
    },
    // "At least this many". Only `gte` for now: every badge anybody has
    // asked for is a threshold, and the other operators would need a UI
    // that explains them.
    threshold: { type: Number, min: 1, required: true },
  },
  { _id: false }
)

const badgeSchema = new Schema(
  {
    // Stable identifier. The five existing badges keep their codes so the
    // client's i18n keys and icons keep working across the migration.
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    icon: { type: String, default: 'award' },
    tier: { type: String, enum: ['BRONZE', 'SILVER', 'GOLD'], default: 'BRONZE' },

    // Every criterion must be met. An OR badge is two badges.
    criteria: { type: [criterionSchema], default: [] },

    points: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },

    // True for the five that shipped in code. They cannot be deleted —
    // people already hold them, and the client resolves their titles by
    // code from its own i18n rather than from `name`.
    isSystem: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

badgeSchema.index({ active: 1, order: 1 })

export const Badge = model('Badge', badgeSchema)
