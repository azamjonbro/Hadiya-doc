import { Schema, model } from 'mongoose'

/**
 * One AI generation run, as a row (10.1).
 *
 * Generation is slow (tens of seconds for a course outline), expensive, and
 * fails in ways worth reading afterwards — so it is a job rather than a
 * request. Three things follow from that:
 *
 *   - the author gets an id immediately and watches the status, instead of
 *     holding a request open past every proxy timeout;
 *   - a failure is recorded where the person who caused it can read it
 *     ("the file had no extractable text" is useful; a 500 is not);
 *   - every run's token usage is stored, which is what makes a monthly
 *     budget possible at all (10.6). A model call whose cost is not written
 *     down anywhere cannot be limited.
 *
 * `result` and `params` are Mixed on purpose: an outline job's parameters
 * and a translation job's have nothing in common, and a typed union of four
 * shapes would be four schemas to keep in step with four prompts.
 */
const aiGenerationJobSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['COURSE_OUTLINE', 'LESSON', 'QUIZ', 'TRANSLATION'],
      required: true,
    },
    status: { type: String, enum: ['PENDING', 'RUNNING', 'DONE', 'FAILED'], default: 'PENDING' },

    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // What the generation is *for*, when it has a target. An outline job has
    // no course yet — it creates one.
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', default: null },

    params: { type: Schema.Types.Mixed, default: {} },
    // The source document, when the job was started from a file. The text is
    // not stored: it is the input to one prompt, it can be hundreds of
    // kilobytes, and keeping it would double the storage of every upload.
    sourceName: { type: String, default: '' },
    sourceChars: { type: Number, default: 0 },

    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },

    // What the call actually cost, from the API's own usage figures rather
    // than an estimate.
    usage: {
      model: { type: String, default: '' },
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      cacheReadTokens: { type: Number, default: 0 },
    },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

aiGenerationJobSchema.index({ requestedBy: 1, createdAt: -1 })
aiGenerationJobSchema.index({ status: 1, createdAt: -1 })
// The budget reads "everything since the first of the month", so the month
// boundary is the query and this is the index for it (10.6).
aiGenerationJobSchema.index({ createdAt: -1 })

export const AiGenerationJob = model('AiGenerationJob', aiGenerationJobSchema)
