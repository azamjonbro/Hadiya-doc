import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

export const openDirectSchema = z.object({
  userId: objectId,
})

// Sent alongside an already-uploaded attachment: the client uploads first
// (POST /chat/attachments), then references the returned key here. Doing it
// in one multipart request would mean a half-sent message whenever the
// upload succeeds but the message write fails.
const attachmentSchema = z.object({
  key: z.string().min(1).max(512),
  mimeType: z.string().max(255).default(''),
  size: z.coerce.number().int().nonnegative().default(0),
  originalFilename: z.string().max(255).default(''),
  durationSec: z.coerce.number().nonnegative().max(3600).default(0),
  width: z.coerce.number().int().nonnegative().max(20000).default(0),
  height: z.coerce.number().int().nonnegative().max(20000).default(0),
})

export const sendChatMessageSchema = z
  .object({
    body: z.string().trim().max(4000).default(''),
    kind: z.enum(['TEXT', 'IMAGE', 'FILE', 'VOICE']).default('TEXT'),
    attachment: attachmentSchema.nullish().default(null),
  })
  .refine((value) => Boolean(value.body) || Boolean(value.attachment), {
    message: 'A message needs text or an attachment',
  })

export const editChatMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(4000),
})

export const chatMessagesQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
})

export const chatContactsQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export const chatSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(120),
  conversationId: objectId.optional(),
})

export const chatUploadKindSchema = z.object({
  kind: z.enum(['IMAGE', 'FILE', 'VOICE']),
})

// The creator is added server-side, so `memberIds` is "everyone else" and
// may legitimately be sent without them in it. The 200 ceiling matches the
// typing relay's fan-out limit in realtime/socket.js.
export const createChatGroupSchema = z.object({
  title: z.string().trim().min(1, 'Group name is required').max(120),
  memberIds: z.array(objectId).min(1, 'Pick at least one member').max(200),
  sourceGroupId: objectId.nullish().default(null),
})

export const renameChatGroupSchema = z.object({
  title: z.string().trim().min(1, 'Group name is required').max(120),
})

export const chatGroupMembersSchema = z.object({
  memberIds: z.array(objectId).min(1, 'Pick at least one member').max(200),
})
