import crypto from 'node:crypto'
import { Schema, model } from 'mongoose'

// Two shapes of thread share this collection:
//
// DIRECT — messages between exactly two users, an admin and an employee or
// two employees. The old shape (one support thread per employee, keyed by
// employeeId) could not express employee↔employee threads at all, so the
// key is the participant pair itself.
//
// GROUP — a named room with any number of members, created by an admin or
// manager (PERMISSIONS.CHAT_GROUP_MANAGE). Membership, not a pair, decides
// who is in it, so there is nothing to deduplicate: two groups with the
// same members and the same name are legitimately two different rooms.
//
// `participantsKey` carries the DIRECT uniqueness constraint: a compound
// index on an array field would not stop the same pair being inserted twice
// under a race, and Mongo cannot express "unique set of two array members"
// any other way. Groups still fill it — with an opaque random key — rather
// than leaving it null, so the existing unique index keeps working as-is
// and no index migration is needed on a live deployment.
export const CONVERSATION_TYPES = Object.freeze(['DIRECT', 'GROUP'])

const readStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: null },
  },
  { _id: false }
)

const conversationSchema = new Schema(
  {
    type: { type: String, enum: CONVERSATION_TYPES, default: 'DIRECT' },
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
    },
    participantsKey: { type: String, required: true, unique: true },
    // GROUP only — a DIRECT thread is named by whoever you are talking to.
    title: { type: String, default: '', trim: true, maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Set when the roster was seeded from an org Group ("Sotuv jamoasi").
    // Kept for traceability only: the chat roster is copied at creation and
    // then lives its own life, so later edits to either side do not
    // silently rewrite the other.
    sourceGroupId: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '' },
    lastMessageKind: { type: String, default: '' },
    lastSenderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reads: { type: [readStateSchema], default: [] },
  },
  { timestamps: true }
)

// Participant-count rules differ per type, which a single path validator
// cannot express — it cannot see `type` on an update. A document hook can.
conversationSchema.pre('validate', function validateParticipants(next) {
  if (this.type === 'DIRECT' && this.participants.length !== 2) {
    next(new Error('A direct conversation needs exactly two participants'))
    return
  }
  // One is enough: a group whose members all leave still belongs to its
  // creator rather than becoming an orphan row nobody can open.
  if (this.type === 'GROUP' && this.participants.length < 1) {
    next(new Error('A group conversation needs at least one member'))
    return
  }
  next()
})

conversationSchema.index({ participants: 1, lastMessageAt: -1 })

// Same ordering rule everywhere a pair is turned into a key, so
// getOrCreate(a, b) and getOrCreate(b, a) resolve to one document.
export function participantsKeyFor(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(':')
}

// Groups have no natural key — this only exists to satisfy the unique
// index the DIRECT pairs need. The `group:` prefix cannot collide with a
// pair key, which is always two hex ObjectIds joined by a colon.
export function groupParticipantsKey() {
  return `group:${crypto.randomUUID()}`
}

export const Conversation = model('Conversation', conversationSchema)
