import { Schema, model } from 'mongoose'

// One caption track (9.4).
//
// Stored as WebVTT whatever it arrived as: that is what a browser's
// `<track>` element reads, and converting on every request would mean
// converting the same file for every viewer (subtitleFormat.js).
//
// `source` distinguishes a track the pipeline found inside the uploaded
// video from one a person uploaded. It matters for trust: an embedded
// track came with the file and may be machine-made in an unknown language,
// while an uploaded one was chosen by an author.
const subtitleSchema = new Schema(
  {
    lang: { type: String, required: true },
    label: { type: String, default: '' },
    key: { type: String, required: true },
    source: { type: String, enum: ['UPLOAD', 'EMBEDDED'], default: 'UPLOAD' },
    // Shown without the viewer asking. At most one per video — the service
    // clears the others when one is set (subtitle.service.js).
    isDefault: { type: Boolean, default: false },
    cueCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
)

const videoSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    posterUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    duration: { type: Number, default: 0 },
    fileSize: { type: Number, default: 0 },
    originalKey: { type: String, default: '' },
    hlsManifestKey: { type: String, default: '' },
    qualities: { type: [String], default: [] },
    processingStatus: {
      type: String,
      enum: ['PENDING', 'VALIDATING', 'TRANSCODING', 'PACKAGING', 'READY', 'FAILED'],
      default: 'PENDING',
    },
    processingError: { type: String, default: '' },
    subtitles: { type: [subtitleSchema], default: [] },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // hasQuiz is set only by the quiz endpoints (quiz.service.js), never
    // directly patchable — keeps it in sync with whether a Quiz doc exists.
    hasQuiz: { type: Boolean, default: false },
    pointsEnabled: { type: Boolean, default: false },
    points: { type: Number, default: 10 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

videoSchema.index({ topicId: 1, order: 1 })
videoSchema.index({ processingStatus: 1 })

export const Video = model('Video', videoSchema)
