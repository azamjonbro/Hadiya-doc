import { Schema, model } from 'mongoose'

/**
 * A knowledge-base article: the answer to "how do I do X here".
 *
 * Unlike news, this is rich HTML — a procedure needs headings, lists and
 * tables, and asking somebody to write one in plain text produces a wall of
 * dashes. That choice is what makes sanitisation mandatory rather than
 * optional: the content is written by staff, stored, and rendered back with
 * `v-html`, so anything the server accepts is something every reader
 * executes. See kbSanitize.js for the allowlist.
 *
 * `bodyText` is the same content stripped of markup, kept for the text
 * index — searching HTML matches `<strong>` and misses a word split across
 * a tag boundary.
 */
const kbArticleSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    summary: { type: String, default: '' },
    body: { type: String, default: '' },
    bodyText: { type: String, default: '' },

    categoryId: { type: Schema.Types.ObjectId, ref: 'KbCategory', default: null },
    tags: { type: [String], default: [] },

    // The same three targeting fields courses and paths use, read by the
    // same rule (services/access/visibility.js). A procedure meant for one
    // branch should not be the top search result for everybody else.
    targetRoles: { type: [String], default: [] },
    branches: { type: [String], default: [] },
    department: { type: String, default: '' },

    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
    publishedAt: { type: Date, default: null },

    // Denormalised counters for the list — the same reason the news list
    // carries them: sorting by "most read" cannot mean a count query per row.
    viewCount: { type: Number, default: 0 },
    helpfulCount: { type: Number, default: 0 },
    notHelpfulCount: { type: Number, default: 0 },

    // Bumped on every published edit. The version rows carry the history;
    // this is what an article links to as "version 4".
    version: { type: Number, min: 1, default: 1 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

kbArticleSchema.index({ categoryId: 1, status: 1 })
kbArticleSchema.index({ tags: 1 })
// Weighted like the course index: a title match outranks a body that
// happens to mention the word.
kbArticleSchema.index(
  { title: 'text', summary: 'text', bodyText: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, summary: 3, bodyText: 1 }, name: 'kb_text' }
)

export const KbArticle = model('KbArticle', kbArticleSchema)
