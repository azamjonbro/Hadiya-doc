import { PERMISSIONS } from '@lms/shared'
import { conversationRepository } from '../../repositories/conversation.repository.js'
import { chatMessageRepository } from '../../repositories/chatMessage.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { groupRepository } from '../../repositories/group.repository.js'
import { chatUploadService } from '../uploads/chatUpload.service.js'
import {
  emitChatMessage,
  emitChatMessageUpdated,
  emitChatRead,
  emitConversationRemoved,
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

// Who wrote it, denormalised onto the message itself rather than looked up
// client-side from the member list. In a group the author has to be legible
// on every bubble, and a member who has since been removed — or a message
// forwarded into search results — would otherwise lose its attribution the
// moment they left the roster.
function toMessageSender(user) {
  if (!user) return null
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    username: user.username,
    avatar: user.avatar,
  }
}

async function loadSendersFor(messages) {
  const senderIds = [...new Set(messages.map((m) => m.senderId.toString()))]
  if (!senderIds.length) return new Map()
  const users = await userRepository.findByIds(senderIds)
  return new Map(users.map((user) => [user._id.toString(), toMessageSender(user)]))
}

async function serializeMessage(message, senderById = null) {
  const attachment = message.attachment
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    sender: senderById?.get(message.senderId.toString()) ?? null,
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

// One sender lookup for the whole page rather than one per bubble.
async function serializeMessages(messages) {
  const senderById = await loadSendersFor(messages)
  return Promise.all(messages.map((message) => serializeMessage(message, senderById)))
}

async function serializeOneMessage(message) {
  const [serialized] = await serializeMessages([message])
  return serialized
}

function readAtFor(conversation, userId) {
  return conversation.reads?.find((r) => r.userId.toString() === String(userId))?.readAt ?? null
}

function isGroup(conversation) {
  return conversation.type === 'GROUP'
}

function otherParticipantId(conversation, userId) {
  return conversation.participants.find((p) => p.toString() !== String(userId))?.toString() ?? null
}

// Per-viewer view of a thread: "the other person" and "unread for me" only
// mean anything relative to who is asking.
function toPublicConversation(conversation, { viewerId, peer, members = [], unreadCount = 0 }) {
  const group = isGroup(conversation)
  return {
    id: conversation._id.toString(),
    type: conversation.type,
    isGroup: group,
    // A DM is named by the other person, a group by its own title — the
    // client renders one field either way instead of branching on type in
    // every list row and header.
    title: group ? conversation.title : peer?.fullName ?? '',
    peer: group ? null : peer,
    members,
    memberCount: members.length,
    createdBy: conversation.createdBy?.toString() ?? null,
    sourceGroupId: conversation.sourceGroupId?.toString() ?? null,
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageKind: conversation.lastMessageKind,
    lastSenderId: conversation.lastSenderId?.toString() ?? null,
    // Whether the *other* side has caught up with what you sent — drives
    // the read ticks on your own messages. Meaningless in a group, where
    // "read" is a different state per member, so it stays null there and
    // the client shows a single tick.
    peerReadAt: group ? null : readAtFor(conversation, otherParticipantId(conversation, viewerId)),
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

function requireGroupManager(actor) {
  if (!actor.permissions?.includes(PERMISSIONS.CHAT_GROUP_MANAGE)) {
    throw ApiError.forbidden('You are not allowed to manage chat groups', 'CHAT_GROUP_FORBIDDEN')
  }
}

// Managing a group's roster needs both the permission *and* membership.
// There is deliberately no "any manager can edit any group" path: the same
// rule that stops staff reading a DM they are not in stops them rewriting
// the membership of a room they were never added to.
async function loadGroupForManager(actor, conversationId) {
  requireGroupManager(actor)
  const conversation = await loadConversationForActor(actor.id, conversationId)
  if (!isGroup(conversation)) throw ApiError.badRequest('Not a group conversation', 'NOT_A_GROUP')
  return conversation
}

// Ids in, verified active user ids out. Silently dropping unknown ids would
// mean a group quietly missing the person the creator thought they added.
async function resolveGroupMembers(memberIds, alwaysIncludeId = null) {
  const wanted = [...new Set([...memberIds.map(String), ...(alwaysIncludeId ? [String(alwaysIncludeId)] : [])])]
  const users = await userRepository.findByIds(wanted)
  const active = users.filter((user) => user.isActive)
  if (active.length !== wanted.length) {
    throw ApiError.badRequest('One or more selected users could not be found', 'INVALID_MEMBERS')
  }
  return active.map((user) => user._id.toString())
}

// Roster changes are written into the thread as SYSTEM messages, the same
// way task events already are. That is what makes a group auditable after
// the fact: who created it, who added whom, and when — read in place,
// rather than inferred from a members list that only shows the end state.
async function postGroupEvent(conversation, actorId, event, params = {}) {
  const message = await chatMessageRepository.create({
    conversationId: conversation._id,
    senderId: actorId,
    kind: 'SYSTEM',
    body: '',
    system: {
      event,
      entityType: 'Conversation',
      entityId: conversation._id.toString(),
      params,
    },
  })

  const updated = await conversationRepository.recordNewMessage(conversation._id, {
    senderId: actorId,
    preview: '',
    kind: 'SYSTEM',
  })

  const publicMessage = await serializeOneMessage(message)
  emitChatMessage(updated.participants.map(String), publicMessage)
  await broadcastConversation(updated)
  return publicMessage
}

// Every user referenced by a batch of threads, loaded once. A group carries
// its whole roster (the info panel lists it and the bubbles are attributed
// from it), so the old "just fetch the peers" query would have been one
// lookup per member per thread.
async function loadParticipants(conversations) {
  const userIds = [...new Set(conversations.flatMap((c) => c.participants.map(String)))]
  const users = await userRepository.findByIds(userIds)
  const roleByUserId = await roleNamesByUserId(users)
  return {
    publicUserById: new Map(
      users.map((user) => [user._id.toString(), toPublicUser(user, roleByUserId.get(user._id.toString()))])
    ),
  }
}

// `context` lets a caller that already loaded the roster (broadcasting the
// same thread to every member, one payload each) avoid re-fetching it per
// viewer.
async function hydrateConversations(conversations, viewerId, context = null) {
  if (!conversations.length) return []

  const { publicUserById } = context ?? (await loadParticipants(conversations))

  const unreadByConversation = await chatMessageRepository.countUnreadByConversation({
    userId: viewerId,
    readCutoffs: conversations.map((c) => ({
      conversationId: c._id,
      readAt: readAtFor(c, viewerId),
    })),
  })

  return conversations.map((conversation) => {
    const peerId = otherParticipantId(conversation, viewerId)
    return toPublicConversation(conversation, {
      viewerId,
      peer: publicUserById.get(peerId) ?? null,
      members: conversation.participants
        .map((id) => publicUserById.get(id.toString()))
        .filter(Boolean),
      unreadCount: unreadByConversation.get(conversation._id.toString()) ?? 0,
    })
  })
}

// Broadcasts the thread summary to every member, each with their own unread
// count — see emitConversationUpdated's contract. The roster is loaded once
// up front, which is what keeps this from being O(members²) queries on a
// group message.
async function broadcastConversation(conversation) {
  const context = await loadParticipants([conversation])
  const payloadByUserId = {}
  for (const participant of conversation.participants) {
    const userId = participant.toString()
    const [summary] = await hydrateConversations([conversation], userId, context)
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
    // findByPair per directory row would be a query per contact. Groups are
    // excluded: "the other participant" is not a thing in a room of five,
    // and mapping one would attach a group thread to whichever member
    // happened to be listed first.
    const myConversations = (await conversationRepository.listForUser(actor.id)).filter((c) => !isGroup(c))
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

    const publicMessage = await serializeOneMessage(message)
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

    const publicMessage = await serializeOneMessage(updated)
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

    const publicMessage = await serializeOneMessage(updated)
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
    const peerIds = [...new Set(conversations.filter((c) => !isGroup(c)).map((c) => otherParticipantId(c, actor.id)).filter(Boolean))]
    const peers = await userRepository.findByIds(peerIds)
    const peerById = new Map(peers.map((u) => [u._id.toString(), u]))

    const serialized = await serializeMessages(rows)

    return serialized.map((message) => {
      const conversation = conversationById.get(message.conversationId)
      const group = conversation && isGroup(conversation)
      return {
        ...message,
        // A hit needs to say where it came from. For a DM that is the other
        // person; for a group it is the room's name, and `sender` on the
        // message itself already says who wrote it.
        peer: group ? null : toPublicUser(peerById.get(otherParticipantId(conversation, actor.id))),
        conversationTitle: group ? conversation.title : '',
        isGroup: Boolean(group),
      }
    })
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

    const publicMessage = await serializeOneMessage(message)
    emitChatMessage(conversation.participants.map(String), publicMessage)
    await broadcastConversation(updated)

    return publicMessage
  },

  // ---------------------------------------------------------------------
  // Group threads
  // ---------------------------------------------------------------------

  // The org groups ("Sotuv jamoasi") offered as a starting roster when
  // creating a chat group. Served from here rather than from /groups so the
  // employee app needs no user:read — the whole feature rides on one
  // permission, and this only ever returns names and member ids.
  async listSourceGroups(actor) {
    requireGroupManager(actor)
    const groups = await groupRepository.listAll({})
    return groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      department: group.department,
      memberIds: group.memberIds.map(String),
      memberCount: group.memberIds.length,
    }))
  },

  async createGroup(actor, { title, memberIds = [], sourceGroupId = null }) {
    requireGroupManager(actor)

    // The creator is always in the room: a group you cannot open is not a
    // group you created, it is one you fired into the void.
    const participantIds = await resolveGroupMembers(memberIds, actor.id)
    if (participantIds.length < 2) {
      throw ApiError.badRequest('A group needs at least one other member', 'GROUP_TOO_SMALL')
    }

    const conversation = await conversationRepository.createGroup({
      title: title.trim(),
      participantIds,
      createdBy: actor.id,
      sourceGroupId,
    })

    await postGroupEvent(conversation, actor.id, 'GROUP_CREATED', { title: conversation.title })

    const [summary] = await hydrateConversations([conversation], actor.id)
    return summary
  },

  async renameGroup(actor, conversationId, title) {
    const conversation = await loadGroupForManager(actor, conversationId)

    // A rename to the name it already has is a no-op, not an event. Without
    // this a repeated call — a double-submit, a retry — writes a second
    // "renamed from X to X" card into the thread's history.
    if (title.trim() === conversation.title) {
      const [unchanged] = await hydrateConversations([conversation], actor.id)
      return unchanged
    }

    const updated = await conversationRepository.updateGroup(conversationId, { title: title.trim() })
    await postGroupEvent(updated, actor.id, 'GROUP_RENAMED', {
      title: updated.title,
      previousTitle: conversation.title,
    })
    const [summary] = await hydrateConversations([updated], actor.id)
    return summary
  },

  async addGroupMembers(actor, conversationId, memberIds) {
    const conversation = await loadGroupForManager(actor, conversationId)

    const existing = new Set(conversation.participants.map(String))
    const toAdd = (await resolveGroupMembers(memberIds)).filter((id) => !existing.has(id))
    if (!toAdd.length) throw ApiError.badRequest('Those users are already members', 'ALREADY_MEMBERS')

    const updated = await conversationRepository.addParticipants(conversationId, toAdd)

    // One event per person rather than one listing everybody: the thread is
    // read as a timeline, and "X added Y" at the point it happened is what
    // makes the roster's history reconstructable.
    const added = await userRepository.findByIds(toAdd)
    for (const user of added) {
      await postGroupEvent(updated, actor.id, 'MEMBER_ADDED', { name: user.fullName })
    }

    const [summary] = await hydrateConversations([updated], actor.id)
    return summary
  },

  async removeGroupMember(actor, conversationId, userId) {
    const conversation = await loadGroupForManager(actor, conversationId)
    if (!conversation.participants.some((p) => p.toString() === String(userId))) {
      throw ApiError.notFound('That user is not a member of this group')
    }

    const removed = await userRepository.findById(userId)
    const updated = await conversationRepository.removeParticipant(conversationId, userId)

    // Posted after the removal, so it reaches the remaining members but not
    // the person who just left — their sidebar drops the thread instead.
    await postGroupEvent(updated, actor.id, 'MEMBER_REMOVED', { name: removed?.fullName ?? '' })
    emitConversationRemoved([String(userId)], String(conversationId))

    const [summary] = await hydrateConversations([updated], actor.id)
    return summary
  },

  // Leaving is not a roster edit anyone needs permission for — it is the
  // one group action a plain member can always take.
  async leaveGroup(actor, conversationId) {
    const conversation = await loadConversationForActor(actor.id, conversationId)
    if (!isGroup(conversation)) throw ApiError.badRequest('Not a group conversation', 'NOT_A_GROUP')

    const me = await userRepository.findById(actor.id)
    const updated = await conversationRepository.removeParticipant(conversationId, actor.id)
    await postGroupEvent(updated, actor.id, 'MEMBER_LEFT', { name: me?.fullName ?? '' })
    emitConversationRemoved([actor.id], String(conversationId))

    return { conversationId: String(conversationId), left: true }
  },
}
