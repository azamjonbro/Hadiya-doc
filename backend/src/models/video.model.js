import { Schema, model } from 'mongoose'

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
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

videoSchema.index({ topicId: 1, order: 1 })
videoSchema.index({ processingStatus: 1 })

export const Video = model('Video', videoSchema)
