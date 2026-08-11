import { Schema, model } from 'mongoose'

const videoSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    activeDuration: { type: Number, default: 0 },
    hiddenDuration: { type: Number, default: 0 },
    watchedDuration: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    device: { type: String, default: '' },
    browser: { type: String, default: '' },
  },
  { timestamps: true }
)

videoSessionSchema.index({ userId: 1, videoId: 1, startedAt: -1 })

export const VideoSession = model('VideoSession', videoSessionSchema)
