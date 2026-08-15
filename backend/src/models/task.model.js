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
    // A task handed to a position or to the whole company is stored as one
    // document per person — each recipient owns their own status, deadline
    // reminders and chat thread. These three fields keep the origin of that
    // fan-out visible: what the assigner picked, and which documents were
    // created by the same action.
    audienceType: { type: String, enum: ['USER', 'POSITION', 'ALL'], default: 'USER' },
    audienceValue: { type: String, default: '' },
    batchId: { type: Schema.Types.ObjectId, default: null },
    // Dedup markers for the scheduled reminder job.
    deadlineReminderSentAt: { type: Date, default: null },
    overdueReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
)

taskSchema.index({ assignedTo: 1, status: 1 })
taskSchema.index({ assignedBy: 1 })
taskSchema.index({ deadline: 1 })
taskSchema.index({ batchId: 1 })

export const Task = model('Task', taskSchema)
