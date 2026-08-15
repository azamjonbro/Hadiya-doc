import { Schema, model } from 'mongoose'

export const MESSAGE_KINDS = Object.freeze(['TEXT', 'IMAGE', 'FILE', 'VOICE', 'SYSTEM'])

// Storage key + display metadata for an image / file / voice note. The key
// is never exposed to clients directly — chat.service.js turns it into a
// short-lived signed URL at serialization time, since the chat bucket is
// private (a leaked attachment URL would otherwise be permanent).
const attachmentSchema = new Schema(
  {
    key: { type: String, required: true },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    originalFilename: { type: String, default: '' },
    // Voice notes only — recorded client-side, so it is a display hint
    // rather than a trusted value.
    durationSec: { type: Number, default: 0 },
    // Images only, so the bubble can reserve the right aspect ratio before
    // the image loads instead of reflowing the whole thread.
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  { _id: false }
)

// SYSTEM messages are written by the app itself (a task was assigned, a
// task was completed, ...). They carry a machine-readable event so the
// client can render them in the reader's own language and deep-link to the
// entity, instead of storing one hard-coded language in `body`.
const systemMetaSchema = new Schema(
  {
    event: { type: String, default: '' },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
    params: { type: Map, of: String, default: undefined },
  },
  { _id: false }
)

const chatMessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: MESSAGE_KINDS, default: 'TEXT' },
    // Markdown source. Empty for a pure attachment message, so this cannot
    // be `required` the way it was when TEXT was the only kind.
    body: { type: String, default: '', trim: true, maxlength: 4000 },
    attachment: { type: attachmentSchema, default: null },
    system: { type: systemMetaSchema, default: null },
    editedAt: { type: Date, default: null },
    // Soft delete — the bubble stays in place as "message deleted" so the
    // surrounding conversation does not silently change meaning.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

chatMessageSchema.index({ conversationId: 1, createdAt: -1 })

export const ChatMessage = model('ChatMessage', chatMessageSchema)
