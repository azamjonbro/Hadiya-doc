import { defineStore } from 'pinia'
import { chatApi } from '@/services/chat'
import { connectSocket, disconnectSocket, emitSocket, onSocket } from '@/services/socket'

// How long a "typing…" indicator survives without a refresh — the peer's
// stop event can be lost (tab closed mid-word), so the indicator has to
// expire on its own rather than stick forever.
const TYPING_TTL_MS = 4000

function sortConversations(list) {
  return [...list].sort((a, b) => {
    const at = new Date(a.lastMessageAt ?? a.createdAt ?? 0).getTime()
    const bt = new Date(b.lastMessageAt ?? b.createdAt ?? 0).getTime()
    return bt - at
  })
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    myId: null,
    conversations: [],
    contacts: [],
    selectedId: null,
    messages: [],
    // Cursor for the *next older* page; null once history is exhausted.
    olderCursor: null,
    loadingMessages: false,
    loadingOlder: false,
    contactsLoading: false,
    // userId -> true, mirrored from the server's presence broadcast.
    online: {},
    // conversationId -> { at, userId } for the last "typing" received. In a
    // group the id is what turns the indicator into a name.
    typingAt: {},
    initialized: false,
  }),

  getters: {
    selected: (state) => state.conversations.find((c) => c.id === state.selectedId) ?? null,
    unreadTotal: (state) => state.conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    isOnline: (state) => (userId) => Boolean(state.online[userId]),
    directConversations: (state) => state.conversations.filter((c) => !c.isGroup),
    groupConversations: (state) => state.conversations.filter((c) => c.isGroup),
    // Recomputed on every tick of the caller's timer, so an expired
    // indicator disappears without needing its own scheduled cleanup.
    peerTyping: (state) => (conversationId) => {
      const entry = state.typingAt[conversationId]
      return Boolean(entry && Date.now() - entry.at < TYPING_TTL_MS)
    },
    typingUserId: (state) => (conversationId) => {
      const entry = state.typingAt[conversationId]
      return entry && Date.now() - entry.at < TYPING_TTL_MS ? entry.userId : null
    },
  },

  actions: {
    // Called once at app boot for an authenticated user — the socket stays
    // alive while the user is anywhere in the app, so the sidebar badge and
    // incoming-message toasts work off the chat page too.
    async init(token, userId) {
      if (this.initialized) return
      this.initialized = true
      this.myId = userId ?? null

      connectSocket(token)
      this.bindSocket()

      try {
        this.conversations = sortConversations(await chatApi.listConversations())
      } catch {
        this.conversations = []
      }
    },

    bindSocket() {
      onSocket('chat:message', (message) => {
        if (message.conversationId === this.selectedId) {
          this.upsertMessage(message)
          // Reading it as it arrives is what keeps the badge honest for an
          // open thread.
          if (message.senderId !== this.myId) this.markRead(message.conversationId)
        }
        delete this.typingAt[message.conversationId]
      })

      onSocket('chat:messageUpdated', (message) => {
        if (message.conversationId === this.selectedId) this.upsertMessage(message)
      })

      onSocket('chat:conversationUpdated', (conversation) => {
        // The server computes unread at send time, so its payload can
        // arrive after this client has already read the message it is
        // announcing. An open thread is read by definition — trust the
        // local state over the in-flight snapshot rather than letting the
        // badge flicker back on.
        const summary =
          conversation.id === this.selectedId ? { ...conversation, unreadCount: 0 } : conversation

        const index = this.conversations.findIndex((c) => c.id === summary.id)
        if (index === -1) this.conversations.push(summary)
        else this.conversations.splice(index, 1, summary)
        this.conversations = sortConversations(this.conversations)

        const contact = this.contacts.find((c) => c.id === summary.peer?.id)
        if (contact) {
          contact.conversationId = summary.id
          contact.lastMessageAt = summary.lastMessageAt
          contact.lastMessagePreview = summary.lastMessagePreview
          contact.unreadCount = summary.unreadCount
        }
      })

      // Removed from a group (or left it elsewhere): drop the thread rather
      // than leave a row that 403s when clicked. No further summary for it
      // will ever arrive, since the server only broadcasts to members.
      onSocket('chat:conversationRemoved', ({ conversationId }) => {
        this.conversations = this.conversations.filter((c) => c.id !== conversationId)
        if (this.selectedId === conversationId) {
          this.selectedId = null
          this.messages = []
        }
      })

      onSocket('chat:read', ({ conversationId, userId, readAt }) => {
        const conversation = this.conversations.find((c) => c.id === conversationId)
        if (!conversation) return
        if (userId === this.myId) conversation.myReadAt = readAt
        else conversation.peerReadAt = readAt
      })

      onSocket('chat:typing', ({ conversationId, userId, typing }) => {
        if (typing) this.typingAt[conversationId] = { at: Date.now(), userId }
        else delete this.typingAt[conversationId]
      })

      onSocket('presence:snapshot', (userIds) => {
        this.online = Object.fromEntries(userIds.map((id) => [id, true]))
      })

      onSocket('presence:update', ({ userId, online }) => {
        if (online) this.online[userId] = true
        else delete this.online[userId]
      })
    },

    upsertMessage(message) {
      const index = this.messages.findIndex((m) => m.id === message.id)
      if (index === -1) this.messages.push(message)
      else this.messages.splice(index, 1, message)
    },

    async loadConversations() {
      this.conversations = sortConversations(await chatApi.listConversations())
    },

    async loadContacts(search = '') {
      this.contactsLoading = true
      try {
        this.contacts = await chatApi.listContacts({ search })
      } finally {
        this.contactsLoading = false
      }
    },

    async openConversation(id) {
      if (!id) return
      this.selectedId = id
      this.messages = []
      this.olderCursor = null
      this.loadingMessages = true
      try {
        const { items, nextCursor } = await chatApi.getMessages(id)
        this.messages = items
        this.olderCursor = nextCursor
        const conversation = this.conversations.find((c) => c.id === id)
        if (conversation) conversation.unreadCount = 0
        const contact = this.contacts.find((c) => c.conversationId === id)
        if (contact) contact.unreadCount = 0
      } finally {
        this.loadingMessages = false
      }
    },

    // Opening a colleague from the directory: creates the thread on first
    // click, reuses it afterwards.
    async openWith(userId) {
      const conversation = await chatApi.openDirect(userId)
      const index = this.conversations.findIndex((c) => c.id === conversation.id)
      if (index === -1) this.conversations = sortConversations([conversation, ...this.conversations])
      else this.conversations.splice(index, 1, conversation)

      const contact = this.contacts.find((c) => c.id === userId)
      if (contact) contact.conversationId = conversation.id

      await this.openConversation(conversation.id)
      return conversation
    },

    async loadOlder() {
      if (!this.selectedId || !this.olderCursor || this.loadingOlder) return
      this.loadingOlder = true
      try {
        const { items, nextCursor } = await chatApi.getMessages(this.selectedId, { before: this.olderCursor })
        this.messages = [...items, ...this.messages]
        this.olderCursor = nextCursor
      } finally {
        this.loadingOlder = false
      }
    },

    async send({ body = '', kind = 'TEXT', attachment = null } = {}) {
      if (!this.selectedId) return null
      const message = await chatApi.sendMessage(this.selectedId, { body, kind, attachment })
      // The socket echo may arrive first or second; upsert makes the order
      // irrelevant instead of racing to append twice.
      this.upsertMessage(message)
      return message
    },

    async edit(messageId, body) {
      this.upsertMessage(await chatApi.editMessage(messageId, body))
    },

    async remove(messageId) {
      this.upsertMessage(await chatApi.deleteMessage(messageId))
    },

    async markRead(conversationId = this.selectedId) {
      if (!conversationId) return
      // Both lists carry their own badge, so both have to be cleared —
      // the directory row and the conversation row are the same thread.
      const conversation = this.conversations.find((c) => c.id === conversationId)
      if (conversation) conversation.unreadCount = 0
      const contact = this.contacts.find((c) => c.conversationId === conversationId)
      if (contact) contact.unreadCount = 0
      try {
        await chatApi.markRead(conversationId)
      } catch {
        // A failed read receipt is cosmetic — the next open retries it.
      }
    },

    // Recipients come from the roster the client already holds — one user
    // for a DM, everyone but you for a group. The server caps the fan-out.
    sendTyping(typing) {
      const conversation = this.selected
      if (!conversation) return
      const toUserIds = conversation.isGroup
        ? conversation.members.map((m) => m.id).filter((id) => id !== this.myId)
        : [conversation.peer?.id].filter(Boolean)
      if (!toUserIds.length) return
      emitSocket('chat:typing', { conversationId: conversation.id, toUserIds, typing })
    },

    // --- group threads ---

    upsertConversation(conversation) {
      const index = this.conversations.findIndex((c) => c.id === conversation.id)
      if (index === -1) this.conversations = sortConversations([conversation, ...this.conversations])
      else this.conversations.splice(index, 1, conversation)
      return conversation
    },

    async createGroup(payload) {
      const conversation = this.upsertConversation(await chatApi.createGroup(payload))
      await this.openConversation(conversation.id)
      return conversation
    },

    async renameGroup(conversationId, title) {
      return this.upsertConversation(await chatApi.renameGroup(conversationId, title))
    },

    async addGroupMembers(conversationId, memberIds) {
      return this.upsertConversation(await chatApi.addGroupMembers(conversationId, memberIds))
    },

    async removeGroupMember(conversationId, userId) {
      return this.upsertConversation(await chatApi.removeGroupMember(conversationId, userId))
    },

    // The socket's conversationRemoved echo also fires, but the list is
    // cleared here too so the thread disappears even if the socket is down.
    async leaveGroup(conversationId) {
      await chatApi.leaveGroup(conversationId)
      this.conversations = this.conversations.filter((c) => c.id !== conversationId)
      if (this.selectedId === conversationId) {
        this.selectedId = null
        this.messages = []
      }
    },

    async uploadAttachment(payload) {
      return chatApi.uploadAttachment(payload)
    },

    reset() {
      disconnectSocket()
      this.$reset()
    },
  },
})
