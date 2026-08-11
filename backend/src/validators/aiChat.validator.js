import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

export const sendAiChatMessageSchema = z.object({
  courseId: objectId,
  topicId: objectId.nullable().optional().default(null),
  videoId: objectId.nullable().optional().default(null),
  message: z.string().trim().min(1, 'Message is required').max(4000, 'Message is too long'),
})

export const aiChatHistoryQuerySchema = z.object({
  courseId: objectId,
  topicId: objectId.nullable().optional().default(null),
  videoId: objectId.nullable().optional().default(null),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
})
