import { Schema, model } from 'mongoose'

const segmentSchema = new Schema(
  {
    start: { type: Number, required: true },
    end: { type: Number, required: true },
  },
  { _id: false }
)

const videoProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    watchedSegments: { type: [segmentSchema], default: [] },
    uniqueWatchedSeconds: { type: Number, default: 0 },
    totalWatchedSeconds: { type: Number, default: 0 },
    completionPercent: { type: Number, default: 0 },
    playsCount: { type: Number, default: 0 },
    pausesCount: { type: Number, default: 0 },
    seeksCount: { type: Number, default: 0 },
    forwardSeekSeconds: { type: Number, default: 0 },
    backwardSeekSeconds: { type: Number, default: 0 },
    bufferingSeconds: { type: Number, default: 0 },
    tabSwitches: { type: Number, default: 0 },
    hiddenDurationSeconds: { type: Number, default: 0 },
    sessionsCount: { type: Number, default: 0 },
    firstWatchedAt: { type: Date, default: null },
    lastWatchedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

videoProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true })
videoProgressSchema.index({ courseId: 1, userId: 1 })

export const VideoProgress = model('VideoProgress', videoProgressSchema)
