import { Schema, model } from 'mongoose'

/**
 * The unified test — what `quizzes` (video) and `assessments` (topic) become.
 *
 * They are two near-identical models today: the same embedded question
 * shape, the same option shape, the same grading loop, duplicated. Every
 * feature since has had to be built twice or has landed in only one of them
 * — which is why a topic test has a timer and a focus-loss rule and a video
 * quiz has neither.
 *
 * ## Why the collection is `testQuizzes` and not `quizzes`
 *
 * `quizzes` is occupied by the legacy model, and AT-09 requires the old
 * endpoints to keep answering unchanged across the release that migrates.
 * Writing the unified rows into the live collection would mean one
 * collection holding two schemas at once, with every legacy read having to
 * tell them apart. A separate collection lets M1 copy forward while the old
 * data stays exactly where the old code expects it; the legacy collections
 * are dropped in a later release, once nothing reads them.
 *
 * `scope` is what makes one model serve both: a VIDEO-scoped test is the
 * old quiz, a TOPIC-scoped one is the old assessment, and COURSE and PATH
 * are the two the platform could not express at all.
 */

// A random draw from a bank. `count` questions matching `tags`, chosen per
// attempt — so two learners sitting the same test do not see the same paper
// (questionSelection.js in 4.3 does the drawing).
const poolSchema = new Schema(
  {
    bankId: { type: Schema.Types.ObjectId, ref: 'QuestionBank', required: true },
    count: { type: Number, min: 1, required: true },
    tags: { type: [String], default: [] },
    difficulty: { type: String, enum: ['', 'EASY', 'MEDIUM', 'HARD'], default: '' },
  },
  { _id: false }
)

const testQuizSchema = new Schema(
  {
    scope: { type: String, enum: ['VIDEO', 'TOPIC', 'COURSE', 'PATH'], required: true },
    // The video / topic / course / path this test belongs to.
    scopeId: { type: Schema.Types.ObjectId, required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Fixed questions, in the author's order. `pools` adds randomly drawn
    // ones on top; a test may use either or both.
    questionIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Question' }], default: [] },
    pools: { type: [poolSchema], default: [] },

    passScorePercent: { type: Number, min: 0, max: 100, default: 70 },
    // 0 means unlimited. The old video quiz had no limit at all and the old
    // assessment had one hard-coded, so neither could express the other.
    maxAttempts: { type: Number, min: 0, default: 0 },
    timeLimitMinutes: { type: Number, min: 0, default: 0 },

    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },

    // Whether a partly-right answer earns part of the marks. A per-test
    // decision, not a per-question one — see questionGrading.js.
    partialCredit: { type: Boolean, default: false },

    // How much the learner is shown afterwards. IMMEDIATE reveals the
    // correct answers as soon as the test is submitted, which is right for
    // practice and wrong for anything that can be retaken.
    revealMode: {
      type: String,
      enum: ['NEVER', 'AFTER_SUBMIT', 'AFTER_PASS', 'AFTER_LAST_ATTEMPT'],
      default: 'AFTER_SUBMIT',
    },
    // Which attempt counts when there are several. LAST is what both legacy
    // models did implicitly, by only ever reading the newest row.
    scorePolicy: { type: String, enum: ['LAST', 'BEST', 'FIRST', 'AVERAGE'], default: 'LAST' },

    // 0 means the rule is off. Above 0, losing focus that many times ends
    // the sitting — the server counts, because a visibilitychange handler
    // is removed from the console in a second.
    focusLossLimit: { type: Number, min: 0, default: 0 },

    pointsEnabled: { type: Boolean, default: false },
    points: { type: Number, min: 0, default: 10 },

    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    order: { type: Number, default: 0 },

    // Where this row came from, when M1 made it. Kept so the migration is
    // idempotent (the unique index below), so a legacy attempt can be traced
    // to the migrated test, and so a re-run repairs rather than duplicates.
    legacyKind: { type: String, enum: ['', 'QUIZ', 'ASSESSMENT'], default: '' },
    legacyId: { type: Schema.Types.ObjectId, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

testQuizSchema.index({ scope: 1, scopeId: 1 })
testQuizSchema.index({ courseId: 1, status: 1 })
// Partial so the many rows created by hand (legacyId null) do not collide
// with each other — only migrated rows are deduplicated, which is exactly
// what makes M1 safe to run twice.
testQuizSchema.index(
  { legacyKind: 1, legacyId: 1 },
  { unique: true, partialFilterExpression: { legacyId: { $type: 'objectId' } } }
)

export const TestQuiz = model('TestQuiz', testQuizSchema)
