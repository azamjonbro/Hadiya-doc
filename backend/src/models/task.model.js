import { Schema, model } from 'mongoose'

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    deadline: { type: Date, default: null },
    attachments: { type: [String], default: [] },
    status: { type: String, enum: ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'TODO' },
    completedAt: { type: Date, default: null },
    // Dedup marker for the scheduled reminder job.
    overdueReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
)

taskSchema.index({ assignedTo: 1, status: 1 })
taskSchema.index({ assignedBy: 1 })
taskSchema.index({ deadline: 1 })

export const Task = model('Task', taskSchema)
