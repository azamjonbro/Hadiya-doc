import { Schema, model } from 'mongoose'

/**
 * One piece of content, in one other language (10.5).
 *
 * A translation is a *layer*, not a copy. The alternative — duplicating the
 * course into a second course — is what most platforms do and it breaks
 * within a month: the two drift, progress is recorded against whichever one
 * the learner opened, and a fix to the original never reaches the copy.
 *
 * So the original row stays the single source of structure, and this row
 * carries only the words. Which means the **ids have to survive**: a
 * translated lesson keeps every block's `_id`, so reading progress
 * (recorded against block ids since 9.1) and every reference into the
 * content still line up whichever language it is read in. `fields` is
 * therefore keyed by path — `title`, `description`, `blocks.<blockId>.text`
 * — rather than being a second copy of the document's shape.
 *
 * `status` exists because a machine translation is a draft by definition.
 * An approved translation is one a person has read; an unapproved one is
 * not served to learners.
 */
const contentTranslationSchema = new Schema(
  {
    entity: { type: String, enum: ['Course', 'Topic', 'Lesson'], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    // BCP 47-ish, and one of the three the interface speaks: a course in a
    // language the app cannot label is not usable.
    lang: { type: String, enum: ['uz', 'ru', 'en'], required: true },

    // path -> translated string. Flat on purpose (see above).
    fields: { type: Schema.Types.Mixed, default: () => ({}) },

    status: { type: String, enum: ['DRAFT', 'APPROVED'], default: 'DRAFT' },
    // Which generation job produced it, and with which model — the two
    // questions asked of any machine translation that turns out wrong.
    jobId: { type: Schema.Types.ObjectId, ref: 'AiGenerationJob', default: null },
    model: { type: String, default: '' },

    // Set when the source changed after this was written. Not a delete: a
    // stale translation of nine paragraphs plus one changed sentence is
    // worth editing, not discarding.
    staleAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// One translation per language per piece of content — a second row for the
// same pair would make "which one is served" a coin flip.
contentTranslationSchema.index({ entity: 1, entityId: 1, lang: 1 }, { unique: true })
contentTranslationSchema.index({ entity: 1, entityId: 1, status: 1 })

export const ContentTranslation = model('ContentTranslation', contentTranslationSchema)
