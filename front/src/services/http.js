import axios from 'axios'
import { getCookie } from '@/utils/cookies'
import { API_BASE_URL } from './apiBase'

export const http = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

// Bound from main.js after the auth store/router exist — kept decoupled here
// so this module never imports them directly (would create a circular
// import, since the store imports `http` to make its own API calls, and the
// router imports the store).
let authStoreRef = null
export function bindAuthStore(store) {
  authStoreRef = store
}

let routerRef = null
export function bindRouter(router) {
  routerRef = router
}

// Session is gone (expired access token that couldn't be silently refreshed,
// or the server rejected us as forbidden) — send the user back to login
// instead of leaving them stuck on a page full of failed requests.
function redirectToLogin() {
  authStoreRef?.clearSession()
  const current = routerRef?.currentRoute.value
  if (current && current.name !== 'login') {
    routerRef.push({ name: 'login', query: { redirect: current.fullPath } })
  }
}

http.interceptors.request.use((config) => {
  if (authStoreRef?.accessToken) {
    config.headers.Authorization = `Bearer ${authStoreRef.accessToken}`
  }
  return config
})

let refreshPromise = null

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const status = error.response?.status
    const isAuthRoute = originalRequest?.url?.includes('/auth/')

    if (status === 401 && !isAuthRoute && !originalRequest?._retried && authStoreRef) {
      originalRequest._retried = true
      if (!refreshPromise) {
        refreshPromise = authStoreRef.restoreSession().finally(() => {
          refreshPromise = null
        })
      }
      await refreshPromise
      if (authStoreRef.accessToken) {
        originalRequest.headers.Authorization = `Bearer ${authStoreRef.accessToken}`
        return http(originalRequest)
      }
    }

    // Only a 401 ends a session, and only once the refresh above has failed
    // to produce a new token. A 403 means the opposite of a dead session:
    // the server authenticated us fine and is refusing this one action — a
    // permission the role lacks, a lesson still locked, a course not
    // assigned. Signing in again cannot change that answer, so bouncing to
    // the login screen would only lose the user's place and hide the real
    // reason.
    //
    // (The previous "403 with no error code" carve-out never fired:
    // ApiError.forbidden always sets a code, defaulting to FORBIDDEN. It
    // did misfire on `responseType: 'blob'` requests such as the report
    // export, where the error body is a Blob and reading .code off it
    // yields undefined — logging the user out mid-download.)
    if (status === 401 && !isAuthRoute) {
      redirectToLogin()
    }

    return Promise.reject(error)
  }
)

// The CSRF token is kept on THIS origin, not read back off the cookie.
// When the API lives on another host (qollanma.techinfo.uz) its csrf_token
// cookie is invisible to document.cookie here, so reading it would yield
// nothing and every /auth/refresh would 403 — logging the user out on each
// reload. The cookie read stays as the fallback for a same-origin deploy and
// for a session that predates this change.
const CSRF_STORAGE_KEY = 'csrf_token'

export function setCsrfToken(token) {
  if (!token) return
  try {
    localStorage.setItem(CSRF_STORAGE_KEY, token)
  } catch {
    // Private-mode / storage-disabled browsers: the cookie fallback below
    // still covers the same-origin case, so this is not fatal.
  }
}

export function clearCsrfToken() {
  try {
    localStorage.removeItem(CSRF_STORAGE_KEY)
  } catch {
    /* nothing to clear if storage was never writable */
  }
}

export function csrfHeader() {
  let token = null
  try {
    token = localStorage.getItem(CSRF_STORAGE_KEY)
  } catch {
    /* fall through to the cookie */
  }
  token = token || getCookie('csrf_token')
  return token ? { 'x-csrf-token': token } : {}
}
