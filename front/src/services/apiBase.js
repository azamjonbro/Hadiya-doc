// Single source of truth for where the API lives.
//
// Read defensively. `??` only falls back on null/undefined, so a
// VITE_API_BASE_URL that exists but is EMPTY — the usual shape of an env
// var created in a hosting dashboard and left blank — sails straight
// through it. An empty baseURL makes axios resolve every call against the
// SPA's own origin, so POST /auth/login hits the static host's SPA rewrite
// and comes back 405 Method Not Allowed, having never reached the API.
// That is exactly what the first Vercel deploy did.
const configured = import.meta.env.VITE_API_BASE_URL?.trim()

export const API_BASE_URL = configured || 'http://localhost:4000/api/v1'

// socket.io connects at the ORIGIN ROOT, not under the versioned API path.
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '')
