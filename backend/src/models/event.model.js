import { Schema, model } from 'mongoose'

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['MEETING', 'TRAINING', 'SEMINAR', 'EVENT', 'ANNOUNCEMENT'], required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    location: { type: String, default: '' },
    participants: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

eventSchema.index({ startAt: 1 })

export const Event = model('Event', eventSchema)
