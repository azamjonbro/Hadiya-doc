import { Schema, model } from 'mongoose'

// One document per turn (user or assistant), scoped to the material the
// conversation is about. courseId is always set (every topic/video belongs
// to a course); topicId/videoId narrow the scope further when the chat was
// opened from a topic or a specific video page.
const aiChatMessageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', default: null },
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', default: null },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
)

aiChatMessageSchema.index({ userId: 1, courseId: 1, topicId: 1, videoId: 1, createdAt: 1 })

export const AiChatMessage = model('AiChatMessage', aiChatMessageSchema)
