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

    // Camera attention monitoring. These count what the learner's own browser
    // reported; the camera frames themselves never leave the device, so this
    // is the entire record of it.
    attentionLostCount: { type: Number, default: 0 },
    inattentiveSeconds: { type: Number, default: 0 },
    attentionWarnings: { type: Number, default: 0 },
    attentionLockouts: { type: Number, default: 0 },
    // Set when the learner refused the camera or it failed — distinguishes
    // "watched attentively" from "was never actually monitored".
    cameraBlocked: { type: Boolean, default: false },
    // Guards the manager notification so it fires once per video, not on
    // every batch after the threshold is crossed.
    inattentionReportedAt: { type: Date, default: null },
    firstWatchedAt: { type: Date, default: null },
    lastWatchedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

videoProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true })
videoProgressSchema.index({ courseId: 1, userId: 1 })

export const VideoProgress = model('VideoProgress', videoProgressSchema)
