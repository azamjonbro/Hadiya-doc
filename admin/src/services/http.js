import axios from 'axios'
import { getCookie } from '@/utils/cookies'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1',
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
    // the server authenticated us fine and is refusing this one action.
    // That is routine in this app — a MANAGER holds course:read but not
    // course:update, user:read but not user:update, news:create but not
    // news:manage — so logging them out on 403 ejected them from the admin
    // app for pressing a button their role was never allowed to use.
    if (status === 401 && !isAuthRoute) {
      redirectToLogin()
    }

    return Promise.reject(error)
  }
)

export function csrfHeader() {
  const token = getCookie('csrf_token')
  return token ? { 'x-csrf-token': token } : {}
}
