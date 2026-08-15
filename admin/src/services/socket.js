import { io } from 'socket.io-client'

// Same origin as the REST API, minus the /api/v1 suffix — sockets connect
// at the server root, not under the versioned API path.
function apiOrigin() {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1'
  return base.replace(/\/api\/v1\/?$/, '')
}

let socket = null

// Handlers registered before the socket exists (a store initialising during
// app boot) are replayed on connect, so callers never have to care about
// ordering.
const pendingHandlers = []

export function connectSocket(token) {
  if (socket) {
    socket.auth = { token }
    if (!socket.connected) socket.connect()
    return socket
  }
  socket = io(apiOrigin(), { auth: { token } })
  for (const [event, handler] of pendingHandlers) socket.on(event, handler)
  pendingHandlers.length = 0
  return socket
}

export function disconnectSocket() {
  socket?.removeAllListeners()
  socket?.disconnect()
  socket = null
  pendingHandlers.length = 0
}

export function getSocket() {
  return socket
}

export function onSocket(event, handler) {
  if (socket) socket.on(event, handler)
  else pendingHandlers.push([event, handler])
}

export function emitSocket(event, payload) {
  socket?.emit(event, payload)
}
