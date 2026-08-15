import { Server } from 'socket.io'
import { verifyAccessToken } from '../utils/tokens.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

let io = null

// Every socket joins a room named after its own user id. Delivery is then
// "emit to each participant" rather than "emit to a conversation room the
// client must have joined first" — which is what the previous per-thread
// room model got wrong: a user who had not opened a thread never received
// its first message, so a brand-new conversation stayed invisible until a
// manual refresh.
function userRoom(userId) {
  return `user:${userId}`
}

// Ceiling on how many user rooms one typing event may touch — comfortably
// above any real group roster, low enough that the relay cannot be turned
// into an all-users broadcast.
const TYPING_FANOUT_LIMIT = 200

// userId -> number of live sockets. A user with a phone and a laptop open
// is one presence, and closing one tab must not flip them offline.
const connectionsByUser = new Map()

function markOnline(userId) {
  const next = (connectionsByUser.get(userId) ?? 0) + 1
  connectionsByUser.set(userId, next)
  return next === 1
}

function markOffline(userId) {
  const next = (connectionsByUser.get(userId) ?? 1) - 1
  if (next <= 0) {
    connectionsByUser.delete(userId)
    return true
  }
  connectionsByUser.set(userId, next)
  return false
}

export function onlineUserIds() {
  return [...connectionsByUser.keys()]
}

export function isUserOnline(userId) {
  return connectionsByUser.has(String(userId))
}

export function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.allowedOrigins, credentials: true },
  })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) throw new Error('Missing token')
      const payload = verifyAccessToken(token)
      socket.user = {
        id: payload.sub,
        roleName: payload.roleName,
        permissions: payload.permissions,
      }
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.user.id
    socket.join(userRoom(userId))

    if (markOnline(userId)) io.emit('presence:update', { userId, online: true })
    socket.emit('presence:snapshot', onlineUserIds())

    // Typing indicators are relayed, never persisted. The recipients come
    // from the client — it already holds the thread's roster — so this is
    // capped at a group's worth of user rooms rather than left unbounded:
    // it must stay a fan-out to one conversation, not a broadcast primitive.
    socket.on('chat:typing', ({ conversationId, toUserIds, typing } = {}) => {
      if (typeof conversationId !== 'string' || !Array.isArray(toUserIds)) return
      const recipients = toUserIds.filter((id) => typeof id === 'string' && id !== userId).slice(0, TYPING_FANOUT_LIMIT)
      for (const recipient of recipients) {
        io.to(userRoom(recipient)).emit('chat:typing', {
          conversationId,
          userId,
          typing: Boolean(typing),
        })
      }
    })

    socket.on('disconnect', () => {
      if (markOffline(userId)) io.emit('presence:update', { userId, online: false })
    })
  })

  logger.info('Socket.IO realtime server initialized')
  return io
}

function emitToUsers(userIds, event, payload) {
  if (!io) return
  for (const userId of userIds) io.to(userRoom(userId)).emit(event, payload)
}

// All of the emitters below are called from services after the write has
// been persisted — never from a route/controller — so the socket layer
// stays a pure side-effect of "it actually happened", not a parallel
// source of truth.
export function emitChatMessage(participantIds, message) {
  emitToUsers(participantIds, 'chat:message', message)
}

export function emitChatMessageUpdated(participantIds, message) {
  emitToUsers(participantIds, 'chat:messageUpdated', message)
}

// The conversation summary is per-viewer (unread count, the "other"
// participant), so each participant gets their own payload rather than one
// shared broadcast.
export function emitConversationUpdated(conversationByUserId) {
  for (const [userId, conversation] of Object.entries(conversationByUserId)) {
    emitToUsers([userId], 'chat:conversationUpdated', conversation)
  }
}

// The counterpart to the above for someone who is no longer a member: they
// are not in the roster any more, so no summary will ever reach them again
// and the thread would otherwise sit in their sidebar until a reload — still
// clickable, answering 403.
export function emitConversationRemoved(userIds, conversationId) {
  emitToUsers(userIds, 'chat:conversationRemoved', { conversationId })
}

export function emitChatRead(participantIds, { conversationId, userId, readAt }) {
  emitToUsers(participantIds, 'chat:read', { conversationId, userId, readAt })
}

export function emitNotification(userId, notification) {
  emitToUsers([userId], 'notification:new', notification)
}
