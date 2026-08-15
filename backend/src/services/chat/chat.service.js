import { conversationRepository } from '../../repositories/conversation.repository.js'
import { chatMessageRepository } from '../../repositories/chatMessage.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { chatUploadService } from '../uploads/chatUpload.service.js'
import {
  emitChatMessage,
  emitChatMessageUpdated,
  emitChatRead,
  emitConversationUpdated,
  isUserOnline,
} from '../../realtime/socket.js'
import { ApiError } from '../../utils/ApiError.js'

// Sidebar preview text for a message whose body is empty (a pure
// attachment). Kept as a short marker rather than a translated string —
// the client renders the icon/label in the reader's own language.
const PREVIEW_BY_KIND = {
  IMAGE: '📷',
  FILE: '📎',
  VOICE: '🎤',
}

function previewFor(message) {
  if (message.deletedAt) return ''
  if (message.body) return message.body.slice(0, 160)
  return PREVIEW_BY_KIND[message.kind] ?? ''
}

function toPublicUser(user, roleName) {
  if (!user) return null
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    department: user.department,
    position: user.position,
    role: roleName ?? '',
    isActive: user.isActive,
    // "New employee" badges in the contact directory are driven by this —
    // the client decides the cutoff, the server just reports the fact.
    joinedAt: user.createdAt,
    online: isUserOnline(user._id),
  }
}

async function serializeMessage(message) {
  const attachment = message.attachment
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    kind: message.kind,
    // A soft-deleted message keeps its place in the thread but never ships
    // its content — not even to the sender.
    body: message.deletedAt ? '' : message.body,
    attachment:
      attachment && !message.deletedAt
        ? {
            url: await chatUploadService.signedUrl(attachment.key, {
              filename: message.kind === 'FILE' ? attachment.originalFilename : undefined,
            }),
            mimeType: attachment.mimeType,
            size: attachment.size,
            originalFilename: attachment.originalFilename,
            durationSec: attachment.durationSec,
            width: attachment.width,
            height: attachment.height,
          }
        : null,
    system: message.system
      ? {
          event: message.system.event,
          entityType: message.system.entityType,
          entityId: message.system.entityId,
          params: message.system.params ? Object.fromEntries(message.system.params) : {},
        }
      : null,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}

function serializeMessages(messages) {
  return Promise.all(messages.map(serializeMessage))
}

function readAtFor(conversation, userId) {
  return conversation.reads?.find((r) => r.userId.toString() === String(userId))?.readAt ?? null
}

function otherParticipantId(conversation, userId) {
  return conversation.participants.find((p) => p.toString() !== String(userId))?.toString() ?? null
}

// Per-viewer view of a thread: "the other person" and "unread for me" only
// mean anything relative to who is asking.
function toPublicConversation(conversation, { viewerId, peer, unreadCount = 0 }) {
  return {
    id: conversation._id.toString(),
    type: conversation.type,
    peer,
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageKind: conversation.lastMessageKind,
    lastSenderId: conversation.lastSenderId?.toString() ?? null,
    // Whether the *other* side has caught up with what you sent — drives
    // the read ticks on your own messages.
    peerReadAt: readAtFor(conversation, otherParticipantId(conversation, viewerId)),
    myReadAt: readAtFor(conversation, viewerId),
    unreadCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  }
}

async function roleNamesByUserId(users) {
  const roleIds = [...new Set(users.map((u) => u.roleId?.toString()).filter(Boolean))]
  const roles = await roleRepository.findByIds(roleIds)
  const nameByRoleId = new Map(roles.map((role) => [role._id.toString(), role.name]))
  return new Map(users.map((u) => [u._id.toString(), nameByRoleId.get(u.roleId?.toString()) ?? '']))
}

async function loadConversationForActor(actorId, conversationId) {
  const conversation = await conversationRepository.findById(conversationId)
  if (!conversation) throw ApiError.notFound('Conversation not found')
  // Participation is the only access rule — there is no "staff can read
  // any thread" escape hatch, because DMs between two employees are not
  // support tickets.
  const isParticipant = conversation.participants.some((p) => p.toString() === String(actorId))
  if (!isParticipant) throw ApiError.forbidden('You are not a participant in this conversation')
  return conversation
}

async function hydrateConversations(conversations, viewerId) {
  if (!conversations.length) return []

  const peerIds = conversations.map((c) => otherParticipantId(c, viewerId)).filter(Boolean)
  const peers = await userRepository.findByIds(peerIds)
  const roleByUserId = await roleNamesByUserId(peers)
  const peerById = new Map(peers.map((u) => [u._id.toString(), u]))

  const unreadByConversation = await chatMessageRepository.countUnreadByConversation({
    userId: viewerId,
    readCutoffs: conversations.map((c) => ({
      conversationId: c._id,
      readAt: readAtFor(c, viewerId),
    })),
  })

  return conversations.map((conversation) => {
    const peerId = otherParticipantId(conversation, viewerId)
    const peer = peerById.get(peerId)
    return toPublicConversation(conversation, {
      viewerId,
      peer: toPublicUser(peer, roleByUserId.get(peerId)),
      unreadCount: unreadByConversation.get(conversation._id.toString()) ?? 0,
    })
  })
}

// Broadcasts the thread summary to both sides, each with their own unread
// count — see emitConversationUpdated's contract.
async function broadcastConversation(conversation) {
  const payloadByUserId = {}
  for (const participant of conversation.participants) {
    const userId = participant.toString()
    const [summary] = await hydrateConversations([conversation], userId)
    payloadByUserId[userId] = summary
  }
  emitConversationUpdated(payloadByUserId)
}

export const chatService = {
  async listConversations(actor) {
    const conversations = await conversationRepository.listForUser(actor.id)
    return hydrateConversations(conversations, actor.id)
  },

  // The full colleague directory — everyone the actor could write to,
  // whether or not a thread exists yet. This is what makes "start a chat
  // with a newly created user" possible without them writing first.
  async listContacts(actor, { search = '', limit = 100 } = {}) {
    const users = await userRepository.searchDirectory({ search, excludeId: actor.id, limit })
    const roleByUserId = await roleNamesByUserId(users)

    // One lookup for every existing thread, then matched in memory — a
    // findByPair per directory row would be a query per contact.
    const myConversations = await conversationRepository.listForUser(actor.id)
    const conversationByPeerId = new Map(
      myConversations.map((c) => [otherParticipantId(c, actor.id), c]).filter(([peerId]) => peerId)
    )

    const unreadByConversation = await chatMessageRepository.countUnreadByConversation({
      userId: actor.id,
      readCutoffs: myConversations.map((c) => ({ conversationId: c._id, readAt: readAtFor(c, actor.id) })),
    })

    return users.map((user) => {
      const conversation = conversationByPeerId.get(user._id.toString())
      return {
        ...toPublicUser(user, roleByUserId.get(user._id.toString())),
        conversationId: conversation?._id.toString() ?? null,
        lastMessageAt: conversation?.lastMessageAt ?? null,
        lastMessagePreview: conversation?.lastMessagePreview ?? '',
        unreadCount: conversation ? unreadByConversation.get(conversation._id.toString()) ?? 0 : 0,
      }
    })
  },

  // Idempotent: clicking a colleague in the directory opens the existing
  // thread if there is one, and creates an empty one otherwise.
  async openDirect(actor, peerId) {
    if (String(peerId) === String(actor.id)) {
      throw ApiError.badRequest('You cannot start a conversation with yourself', 'SELF_CONVERSATION')
    }
    const peer = await userRepository.findById(peerId)
    if (!peer || !peer.isActive) throw ApiError.notFound('User not found')

    const conversation = await conversationRepository.getOrCreateDirect(actor.id, peerId)
    const [summary] = await hydrateConversations([conversation], actor.id)
    // The peer's sidebar should show the new (empty) thread immediately,
    // not only once the first message lands.
    await broadcastConversation(conversation)
    return summary
  },

  async getConversation(actor, conversationId) {
    const conversation = await loadConversationForActor(actor.id, conversationId)
    const [summary] = await hydrateConversations([conversation], actor.id)
    return summary
  },

  async getMessages(actor, conversationId, { before, limit = 40 } = {}) {
    const conversation = await loadConversationForActor(actor.id, conversationId)
    const { messages, nextCursor } = await chatMessageRepository.listPage(conversationId, { before, limit })

    // Opening (or paging to) the newest slice is what marks the thread
    // read — paging backwards through history must not.
    if (!before) await this.markRead(actor, conversationId)

    return { items: await serializeMessages(messages), nextCursor }
  },

  async markRead(actor, conversationId) {
    const conversation = await loadConversationForActor(actor.id, conversationId)
    const updated = await conversationRepository.markRead(conversationId, actor.id)
    emitChatRead(updated.participants.map(String), {
      conversationId: String(conversationId),
      userId: actor.id,
      readAt: readAtFor(updated, actor.id),
    })
    return { conversationId: String(conversationId), readAt: readAtFor(updated, actor.id) }
  },

  async sendMessage(actor, conversationId, { body = '', kind = 'TEXT', attachment = null }) {
    const conversation = await loadConversationForActor(actor.id, conversationId)

    if (kind === 'SYSTEM') throw ApiError.badRequest('System messages cannot be sent by a user', 'INVALID_MESSAGE_KIND')
    if (!body.trim() && !attachment) {
      throw ApiError.badRequest('A message needs text or an attachment', 'EMPTY_MESSAGE')
    }
    if (kind !== 'TEXT' && !attachment) {
      throw ApiError.badRequest(`A ${kind} message requires an attachment`, 'ATTACHMENT_REQUIRED')
    }
    // The client sends back a storage key it received from
    // POST /chat/attachments. Keys are namespaced by uploader, so this
    // pins a message to something the sender actually uploaded — otherwise
    // a leaked key could be re-attached by whoever saw it.
    if (attachment && !String(attachment.key).startsWith(`${actor.id}/`)) {
      throw ApiError.forbidden('Attachment does not belong to you', 'ATTACHMENT_NOT_OWNED')
    }

    const message = await chatMessageRepository.create({
      conversationId,
      senderId: actor.id,
      kind,
      body: body.trim(),
      attachment,
    })

    const updated = await conversationRepository.recordNewMessage(conversationId, {
      senderId: actor.id,
      preview: previewFor(message),
      kind,
    })

    const publicMessage = await serializeMessage(message)
    emitChatMessage(conversation.participants.map(String), publicMessage)
    await broadcastConversation(updated)

    return publicMessage
  },

  async editMessage(actor, messageId, body) {
    const message = await chatMessageRepository.findById(messageId)
    if (!message) throw ApiError.notFound('Message not found')
    if (message.senderId.toString() !== actor.id) throw ApiError.forbidden('You can only edit your own messages')
    if (message.deletedAt) throw ApiError.conflict('Message was deleted', 'MESSAGE_DELETED')
    if (message.kind !== 'TEXT') throw ApiError.badRequest('Only text messages can be edited', 'NOT_EDITABLE')

    const conversation = await loadConversationForActor(actor.id, message.conversationId)
    const updated = await chatMessageRepository.update(messageId, { body: body.trim(), editedAt: new Date() })

    const publicMessage = await serializeMessage(updated)
    emitChatMessageUpdated(conversation.participants.map(String), publicMessage)

    // Keep the sidebar honest when the edited message is the latest one.
    if (conversation.lastSenderId?.toString() === actor.id) {
      const latest = await chatMessageRepository.findLatest(message.conversationId)
      if (latest && latest._id.toString() === messageId) {
        const refreshed = await conversationRepository.refreshPreview(message.conversationId, {
          preview: previewFor(updated),
          kind: updated.kind,
        })
        await broadcastConversation(refreshed)
      }
    }

    return publicMessage
  },

  async deleteMessage(actor, messageId) {
    const message = await chatMessageRepository.findById(messageId)
    if (!message) throw ApiError.notFound('Message not found')
    if (message.senderId.toString() !== actor.id) throw ApiError.forbidden('You can only delete your own messages')

    const conversation = await loadConversationForActor(actor.id, message.conversationId)
    const updated = await chatMessageRepository.update(messageId, { deletedAt: new Date() })

    const publicMessage = await serializeMessage(updated)
    emitChatMessageUpdated(conversation.participants.map(String), publicMessage)

    const latest = await chatMessageRepository.findLatest(message.conversationId)
    const refreshed = await conversationRepository.refreshPreview(message.conversationId, {
      preview: latest ? previewFor(latest) : '',
      kind: latest?.kind ?? '',
    })
    await broadcastConversation(refreshed)

    return publicMessage
  },

  // Searches only threads the actor participates in — scoped by
  // construction rather than by a filter that could be forgotten.
  async searchMessages(actor, { query, conversationId }) {
    const conversations = conversationId
      ? [await loadConversationForActor(actor.id, conversationId)]
      : await conversationRepository.listForUser(actor.id)

    const rows = await chatMessageRepository.search({
      conversationIds: conversations.map((c) => c._id),
      query,
    })

    const conversationById = new Map(conversations.map((c) => [c._id.toString(), c]))
    const peerIds = [...new Set(conversations.map((c) => otherParticipantId(c, actor.id)).filter(Boolean))]
    const peers = await userRepository.findByIds(peerIds)
    const peerById = new Map(peers.map((u) => [u._id.toString(), u]))

    return Promise.all(
      rows.map(async (row) => {
        const conversation = conversationById.get(row.conversationId.toString())
        const peer = peerById.get(otherParticipantId(conversation, actor.id))
        return {
          ...(await serializeMessage(row)),
          peer: toPublicUser(peer),
        }
      })
    )
  },

  // Everything the info panel shows about a thread in one call: who it is
  // with, when it started, when it last moved, how much has been said, and
  // the shared media.
  async getConversationDetails(actor, conversationId) {
    const conversation = await loadConversationForActor(actor.id, conversationId)
    const [summary] = await hydrateConversations([conversation], actor.id)
    const [messageCount, attachmentRows] = await Promise.all([
      chatMessageRepository.countByConversation(conversationId),
      chatMessageRepository.listAttachments(conversationId),
    ])

    return {
      ...summary,
      messageCount,
      attachments: await serializeMessages(attachmentRows),
    }
  },

  async uploadAttachment(actor, kind, file) {
    return chatUploadService.upload(actor, kind, file)
  },

  // App-authored message (a task was assigned, a task was completed, ...).
  // `fromUserId` is the acting human so the bubble is attributed correctly;
  // the SYSTEM kind is what makes the client render it as an event card
  // rather than as something that person typed.
  async postSystemMessage({ fromUserId, toUserId, event, entityType, entityId, params = {}, preview = '' }) {
    if (String(fromUserId) === String(toUserId)) return null

    const conversation = await conversationRepository.getOrCreateDirect(fromUserId, toUserId)
    const message = await chatMessageRepository.create({
      conversationId: conversation._id,
      senderId: fromUserId,
      kind: 'SYSTEM',
      body: '',
      system: { event, entityType, entityId: String(entityId ?? ''), params },
    })

    const updated = await conversationRepository.recordNewMessage(conversation._id, {
      senderId: fromUserId,
      preview: preview.slice(0, 160),
      kind: 'SYSTEM',
    })

    const publicMessage = await serializeMessage(message)
    emitChatMessage(conversation.participants.map(String), publicMessage)
    await broadcastConversation(updated)

    return publicMessage
  },
}
