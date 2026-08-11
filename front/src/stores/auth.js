import { defineStore } from 'pinia'
import { http, csrfHeader } from '@/services/http'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    user: null,
    initializing: true,
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    permissions: (state) => state.user?.permissions ?? [],
  },

  actions: {
    hasPermission(permission) {
      return this.permissions.includes(permission)
    },

    setSession({ accessToken, user }) {
      this.accessToken = accessToken
      this.user = user
    },

    clearSession() {
      this.accessToken = null
      this.user = null
    },

    async login(identifier, password, captchaToken) {
      const { data } = await http.post('/auth/login', { identifier, password, captchaToken })
      this.setSession(data.data)
    },

    async logout() {
      try {
        await http.post('/auth/logout')
      } finally {
        this.clearSession()
      }
    },

    // Silent session restore on app boot, using the httpOnly refresh cookie
    // from a previous login — lets a page reload keep the user signed in
    // without re-entering credentials.
    async restoreSession() {
      try {
        const { data } = await http.post('/auth/refresh', null, { headers: csrfHeader() })
        this.setSession(data.data)
      } catch {
        this.clearSession()
      } finally {
        this.initializing = false
      }
    },
  },
})
