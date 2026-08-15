import mongoose from 'mongoose'
import { Conversation, groupParticipantsKey, participantsKeyFor } from '../models/conversation.model.js'

function toObjectId(value) {
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value))
}

export const conversationRepository = {
  findById(id) {
    return Conversation.findById(id)
  },

  findByPair(userIdA, userIdB) {
    return Conversation.findOne({ participantsKey: participantsKeyFor(userIdA, userIdB) })
  },

  // Upsert on participantsKey, not on `participants` — two simultaneous
  // "open a chat with X" clicks would otherwise create two threads for the
  // same pair (the unique index is what makes this safe, the upsert alone
  // is not).
  getOrCreateDirect(userIdA, userIdB) {
    const participantsKey = participantsKeyFor(userIdA, userIdB)
    return Conversation.findOneAndUpdate(
      { participantsKey },
      {
        $setOnInsert: {
          participantsKey,
          type: 'DIRECT',
          participants: [userIdA, userIdB],
          reads: [
            { userId: userIdA, readAt: null },
            { userId: userIdB, readAt: null },
          ],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  },

  // No getOrCreate counterpart: a group is not identified by its roster, so
  // creating the "same" group twice is a legitimate thing to do (two rooms
  // with the same people). The caller has already deduplicated and
  // validated `participantIds`.
  createGroup({ title, participantIds, createdBy, sourceGroupId = null }) {
    return Conversation.create({
      type: 'GROUP',
      participantsKey: groupParticipantsKey(),
      title,
      participants: participantIds,
      createdBy,
      sourceGroupId,
      reads: participantIds.map((userId) => ({ userId, readAt: null })),
    })
  },

  // $addToSet on both arrays so re-adding somebody who is already in the
  // room is a no-op rather than a duplicate row in `reads` (which would
  // make markRead update only one of the two and leave a phantom unread).
  addParticipants(id, userIds) {
    return Conversation.findByIdAndUpdate(
      id,
      {
        $addToSet: {
          participants: { $each: userIds.map(toObjectId) },
          reads: { $each: userIds.map((userId) => ({ userId: toObjectId(userId), readAt: null })) },
        },
      },
      { new: true }
    )
  },

  removeParticipant(id, userId) {
    return Conversation.findByIdAndUpdate(
      id,
      {
        $pull: {
          participants: toObjectId(userId),
          reads: { userId: toObjectId(userId) },
        },
      },
      { new: true }
    )
  },

  updateGroup(id, { title }) {
    return Conversation.findByIdAndUpdate(id, { $set: { title } }, { new: true })
  },

  // Every thread the user is part of, including ones with no messages yet
  // (a freshly opened chat must still appear in their own sidebar).
  // Sorted by last activity, falling back to creation time for empty threads.
  listForUser(userId, { limit = 200 } = {}) {
    return Conversation.find({ participants: userId })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .limit(limit)
  },

  listByIds(ids) {
    return Conversation.find({ _id: { $in: ids } })
  },

  recordNewMessage(id, { senderId, preview, kind }) {
    const now = new Date()
    return Conversation.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          lastMessageAt: now,
          lastMessagePreview: preview,
          lastMessageKind: kind,
          lastSenderId: senderId,
          // The sender is trivially caught up on their own message.
          'reads.$[sender].readAt': now,
        },
      },
      // Cast explicitly: arrayFilters values are not run through schema
      // casting, so a string id would silently match nothing and leave the
      // sender's own message counted as unread for them.
      { new: true, arrayFilters: [{ 'sender.userId': toObjectId(senderId) }] }
    )
  },

  // Refreshes the preview after an edit/delete so the sidebar never shows
  // text that no longer exists in the thread.
  refreshPreview(id, { preview, kind }) {
    return Conversation.findByIdAndUpdate(
      id,
      { $set: { lastMessagePreview: preview, lastMessageKind: kind } },
      { new: true }
    )
  },

  async markRead(id, userId) {
    const now = new Date()
    const updated = await Conversation.findOneAndUpdate(
      { _id: id, 'reads.userId': userId },
      { $set: { 'reads.$.readAt': now } },
      { new: true }
    )
    if (updated) return updated
    // Read state row missing (thread created before this participant was
    // tracked) — add it rather than silently dropping the read.
    return Conversation.findByIdAndUpdate(id, { $push: { reads: { userId, readAt: now } } }, { new: true })
  },
}

export { groupParticipantsKey, participantsKeyFor }
