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

    // A 403 is not necessarily "your session died" — most of them now mean
    // "you are signed in fine, but you may not do this yet" (a locked
    // lesson, a course you are not assigned to). Those carry a domain error
    // code, and bouncing the user to the login screen for one both loses
    // their place and hides the actual reason. Only a 403 with no code —
    // i.e. the auth layer itself rejecting us — still ends the session.
    const isAuthorizationDenial = status === 403 && Boolean(error.response?.data?.code)
    if ((status === 401 || status === 403) && !isAuthRoute && !isAuthorizationDenial) {
      redirectToLogin()
    }

    return Promise.reject(error)
  }
)

export function csrfHeader() {
  const token = getCookie('csrf_token')
  return token ? { 'x-csrf-token': token } : {}
}
