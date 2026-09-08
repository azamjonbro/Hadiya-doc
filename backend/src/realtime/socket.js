import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { verifyAccessToken } from '../utils/tokens.js'
import { env } from '../config/env.js'
import { redisConnection } from '../config/redis.js'
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

// userId -> number of live sockets ON THIS PROCESS. A user with a phone and
// a laptop open is one presence, and closing one tab must not flip them
// offline.
const localConnectionsByUser = new Map()

// Everyone believed online anywhere in the cluster. Kept as a separate set
// because presence has to be answerable synchronously — toPublicUser() in
// chat.service.js stamps `online` on every contact it renders — while the
// only cross-node source of truth (the adapter's socket listing) is async.
// The local map above is merged in on every read so this process's own
// connections are never stale, whatever the sweep last saw.
let clusterOnlineUsers = new Set()

const PRESENCE_SWEEP_MS = 15_000
let presenceSweep = null

function markOnline(userId) {
  const next = (localConnectionsByUser.get(userId) ?? 0) + 1
  localConnectionsByUser.set(userId, next)
  clusterOnlineUsers.add(userId)
  return next === 1
}

function markOffline(userId) {
  const next = (localConnectionsByUser.get(userId) ?? 1) - 1
  if (next <= 0) {
    localConnectionsByUser.delete(userId)
    return true
  }
  localConnectionsByUser.set(userId, next)
  return false
}

/**
 * Rebuilds the cluster-wide view from every node's sockets.
 *
 * A periodic sweep rather than replicated online/offline events: a node that
 * is killed (deploy, OOM) never sends its disconnects, so an event-only
 * scheme leaves users pinned online forever on every other node. Asking the
 * adapter what is actually connected cannot drift that way — the worst case
 * is that presence is up to PRESENCE_SWEEP_MS stale, which for a contact
 * list is not worth a heartbeat protocol.
 */
async function sweepPresence() {
  if (!io) return
  const sockets = await io.fetchSockets()
  clusterOnlineUsers = new Set(sockets.map((socket) => socket.data.userId).filter(Boolean))
}

export function onlineUserIds() {
  return [...new Set([...clusterOnlineUsers, ...localConnectionsByUser.keys()])]
}

export function isUserOnline(userId) {
  const id = String(userId)
  return localConnectionsByUser.has(id) || clusterOnlineUsers.has(id)
}

export function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.allowedOrigins, credentials: true },
  })

  // Without this the API is only correct as a single process, and
  // ecosystem.config.cjs runs it in cluster mode: a chat message emitted by
  // the instance that handled the POST reaches only the sockets connected to
  // that same instance, so whether a message arrives live depends on which
  // worker accepted the sender's request and which accepted the recipient's.
  // The adapter needs its own connections — a Redis client in subscribe mode
  // cannot serve ordinary commands, and redisConnection is shared with BullMQ
  // and the caches.
  io.adapter(createAdapter(redisConnection.duplicate(), redisConnection.duplicate()))

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
    // socket.data, not socket.user: fetchSockets() returns remote sockets as
    // plain handles that carry `data` across nodes and nothing else.
    socket.data.userId = userId
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

  presenceSweep = setInterval(() => {
    sweepPresence().catch((error) => {
      logger.error('Presence sweep failed', { error: error.message })
    })
  }, PRESENCE_SWEEP_MS)
  presenceSweep.unref()

  logger.info('Socket.IO realtime server initialized (Redis adapter, cluster-safe)')
  return io
}

// Only used by tests and shutdown — an interval and two Redis connections
// would otherwise keep the process alive.
export async function closeSocketServer() {
  if (presenceSweep) clearInterval(presenceSweep)
  presenceSweep = null
  if (io) await io.close()
  io = null
  localConnectionsByUser.clear()
  clusterOnlineUsers = new Set()
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
