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

    // Typing indicators are relayed, never persisted — the peer id comes
    // from the client, so this can only ever reach one specific user room
    // and cannot be used to broadcast.
    socket.on('chat:typing', ({ conversationId, toUserId, typing } = {}) => {
      if (typeof conversationId !== 'string' || typeof toUserId !== 'string') return
      io.to(userRoom(toUserId)).emit('chat:typing', {
        conversationId,
        userId,
        typing: Boolean(typing),
      })
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

export function emitChatRead(participantIds, { conversationId, userId, readAt }) {
  emitToUsers(participantIds, 'chat:read', { conversationId, userId, readAt })
}

export function emitNotification(userId, notification) {
  emitToUsers([userId], 'notification:new', notification)
}
