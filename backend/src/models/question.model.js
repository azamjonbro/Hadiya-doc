import { Schema, model } from 'mongoose'

/**
 * One question, of any of the supported types.
 *
 * Today a question is an embedded subdocument with `text` and `options[]`,
 * duplicated in quiz.model.js and assessment.model.js. That shape can only
 * express "pick one of these" — every other kind of question the platform is
 * supposed to ask (match these pairs, put these in order, fill the blank,
 * click the right part of the diagram) has nowhere to live.
 *
 * Hence a collection, and hence `payload`: the part of a question that
 * differs by type. It is `Mixed` because there is no single shape — a
 * matching question's pairs and a numeric question's tolerance have nothing
 * in common — and mongoose cannot discriminate on a subdocument without
 * fourteen sub-schemas that would each need updating whenever a type gains
 * a field. The shapes are enforced at the edge instead, by zod, in
 * question.validator.js, which is where a bad payload actually arrives.
 */

// DRAG_WORDS is DRAG_DROP with a sentence for a backdrop rather than a
// canvas — same payload, same grading, different editor. The spec calls
// this thirteen types because it counts the pair once.
export const QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'NUMERIC',
  'MATCHING',
  'SEQUENCE',
  'FILL_BLANK',
  'SELECT_LIST',
  'HOTSPOT',
  'LIKERT',
  'DRAG_DROP',
  'DRAG_WORDS',
  'ESSAY',
]

const mediaSchema = new Schema(
  {
    key: { type: String, default: '' },
    type: { type: String, enum: ['IMAGE', 'AUDIO', 'VIDEO'], default: 'IMAGE' },
    // Required by anyone using a screen reader, and the reason it is a field
    // rather than a nice-to-have: a question whose entire content is an
    // image is unanswerable without it (Blok 12).
    altText: { type: String, default: '' },
  },
  { _id: false }
)

const questionSchema = new Schema(
  {
    bankId: { type: Schema.Types.ObjectId, ref: 'QuestionBank', required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    text: { type: String, required: true, trim: true },
    // Shown after the attempt, when revealMode allows it. Held on the
    // question rather than on the quiz so it travels with reuse — an
    // explanation written once is right in every quiz that borrows it.
    explanation: { type: String, default: '' },

    points: { type: Number, min: 0, default: 1 },
    // Negative marking, off by default. Some certification bodies require
    // it; most training does not, and turning it on by accident makes a
    // test punish guessing in a way nobody was told about.
    penalty: { type: Number, min: 0, default: 0 },

    tags: { type: [String], default: [] },
    difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], default: 'MEDIUM' },
    media: { type: mediaSchema, default: () => ({}) },

    // Type-specific. See the shapes in question.validator.js.
    payload: { type: Schema.Types.Mixed, default: () => ({}) },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

questionSchema.index({ bankId: 1, type: 1 })
questionSchema.index({ tags: 1 })
// Authors search their own banks by wording constantly ("did we already ask
// about lockout?"), and a bank of four hundred questions is not scannable.
questionSchema.index({ text: 'text' }, { name: 'question_text' })

export const Question = model('Question', questionSchema)
