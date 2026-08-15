import { Schema, model } from 'mongoose'

// Direct messages between any two users — an admin and an employee, or two
// employees. The old shape (one support thread per employee, keyed by
// employeeId) could not express employee↔employee threads at all, so the
// key is now the participant pair itself.
//
// `participantsKey` is the sorted "a:b" id pair and carries the uniqueness
// constraint: a compound index on an array field would not stop the same
// pair being inserted twice under a race, and Mongo cannot express
// "unique set of two array members" any other way.
const readStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: null },
  },
  { _id: false }
)

const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['DIRECT'], default: 'DIRECT' },
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: [(value) => value.length === 2, 'A direct conversation needs exactly two participants'],
    },
    participantsKey: { type: String, required: true, unique: true },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '' },
    lastMessageKind: { type: String, default: '' },
    lastSenderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reads: { type: [readStateSchema], default: [] },
  },
  { timestamps: true }
)

conversationSchema.index({ participants: 1, lastMessageAt: -1 })

// Same ordering rule everywhere a pair is turned into a key, so
// getOrCreate(a, b) and getOrCreate(b, a) resolve to one document.
export function participantsKeyFor(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(':')
}

export const Conversation = model('Conversation', conversationSchema)
