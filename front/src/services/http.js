import axios from 'axios'
import { getCookie } from '@/utils/cookies'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1',
  withCredentials: true,
})

// Bound from main.js after the auth store exists — kept decoupled here so
// this module never imports the store directly (would create a circular
// import, since the store imports `http` to make its own API calls).
let authStoreRef = null
export function bindAuthStore(store) {
  authStoreRef = store
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

    return Promise.reject(error)
  }
)

export function csrfHeader() {
  const token = getCookie('csrf_token')
  return token ? { 'x-csrf-token': token } : {}
}
