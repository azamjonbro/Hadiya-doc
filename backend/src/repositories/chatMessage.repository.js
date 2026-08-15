import mongoose from 'mongoose'
import { ChatMessage } from '../models/chatMessage.model.js'

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const chatMessageRepository = {
  create(data) {
    return ChatMessage.create(data)
  },

  findById(id) {
    return ChatMessage.findById(id)
  },

  // Newest-first page, reversed to chronological order for rendering.
  // `before` is a createdAt ISO string — cursoring on the sort key rather
  // than on _id keeps "load older messages" correct even when two messages
  // land in the same millisecond batch insert.
  async listPage(conversationId, { before, limit = 40 } = {}) {
    const filter = { conversationId }
    if (before) filter.createdAt = { $lt: new Date(before) }

    const rows = await ChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    return {
      messages: page.reverse(),
      // Cursor for the *next older* page — the oldest item now in hand.
      nextCursor: hasMore ? page[0].createdAt.toISOString() : null,
    }
  },

  // Latest surviving message, used to rebuild a conversation preview after
  // the previous last message was deleted.
  findLatest(conversationId) {
    return ChatMessage.findOne({ conversationId, deletedAt: null }).sort({ createdAt: -1 })
  },

  search({ conversationIds, query, limit = 40 }) {
    const regex = new RegExp(escapeRegex(query.trim()), 'i')
    return ChatMessage.find({
      conversationId: { $in: conversationIds },
      deletedAt: null,
      $or: [{ body: regex }, { 'attachment.originalFilename': regex }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
  },

  // Unread counts for many conversations in one round trip — the sidebar
  // renders a badge per thread, and doing this per conversation would be a
  // query per row on every inbox load.
  //
  // `readCutoffs` is [{ conversationId, readAt }]; a null readAt means the
  // user has never opened that thread, so everything counts.
  async countUnreadByConversation({ readCutoffs, userId }) {
    if (!readCutoffs.length) return new Map()

    const clauses = readCutoffs.map(({ conversationId, readAt }) => ({
      conversationId: new mongoose.Types.ObjectId(String(conversationId)),
      ...(readAt ? { createdAt: { $gt: readAt } } : {}),
    }))

    const rows = await ChatMessage.aggregate([
      {
        $match: {
          $or: clauses,
          deletedAt: null,
          senderId: { $ne: new mongoose.Types.ObjectId(String(userId)) },
        },
      },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } },
    ])

    return new Map(rows.map((row) => [row._id.toString(), row.count]))
  },

  countByConversation(conversationId) {
    return ChatMessage.countDocuments({ conversationId, deletedAt: null })
  },

  // Attachment gallery for the conversation info panel.
  listAttachments(conversationId, { limit = 60 } = {}) {
    return ChatMessage.find({
      conversationId,
      deletedAt: null,
      attachment: { $ne: null },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
  },

  update(id, data) {
    return ChatMessage.findByIdAndUpdate(id, { $set: data }, { new: true })
  },
}
