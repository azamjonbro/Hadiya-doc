import { defineStore } from 'pinia'
import { http, csrfHeader, setCsrfToken, clearCsrfToken } from '@/services/http'
import { faceApi } from '@/services/face'
import { useChatStore } from './chat'

// The admin area is for these three only; everyone else gets the employee
// side. Kept next to the store rather than in the router so the guard and the
// per-page checks agree on one definition.
const ADMIN_APP_ROLES = ['SUPERADMIN', 'ADMIN', 'MANAGER']

// Module-level, not store state: it is a promise, not something any component
// should be reading or that ought to end up in devtools' state tree.
let restorePromise = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    user: null,
    initializing: true,
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    permissions: (state) => state.user?.permissions ?? [],
    canUseAdminApp: (state) => ADMIN_APP_ROLES.includes(state.user?.role),
    // Gate for the few irreversible actions that stay with SUPERADMIN even
    // when the matching permission has been granted more widely.
    isSuperAdmin: (state) => state.user?.role === 'SUPERADMIN',
  },

  actions: {
    hasPermission(permission) {
      return this.permissions.includes(permission)
    },

    setSession({ accessToken, user, csrfToken }) {
      this.accessToken = accessToken
      this.user = user
      setCsrfToken(csrfToken)
      useChatStore().init(accessToken, user.id)
    },

    clearSession() {
      this.accessToken = null
      this.user = null
      clearCsrfToken()
      useChatStore().reset()
    },

    // Two possible outcomes: a normal session, or a face-verification
    // challenge (requiresFaceVerification: true) that must be completed via
    // completeFaceLogin() before any session exists. Returning the raw
    // shape rather than always calling setSession keeps this store the only
    // place that decides what "logged in" means, while letting the login
    // view branch on which case it got.
    async login(identifier, password, captchaToken) {
      const { data } = await http.post('/auth/login', { identifier, password, captchaToken })
      if (data.data.requiresFaceVerification) {
        return { requiresFaceVerification: true, verificationToken: data.data.verificationToken }
      }
      this.setSession(data.data)
      return { requiresFaceVerification: false }
    },

    // Completes a login that stopped at a face-verification challenge.
    // photoBlob is one JPEG frame from useFaceVerification's capture().
    async completeFaceLogin(verificationToken, photoBlob) {
      const session = await faceApi.verify(photoBlob, { verificationToken })
      this.setSession(session)
    },

    async logout() {
      try {
        await http.post('/auth/logout')
      } finally {
        this.clearSession()
      }
    },

    // Awaited by the router guard, and kicked off by main.js without being
    // awaited, so the app can mount while the refresh is still in flight.
    // Memoised because both callers race on boot and a second /auth/refresh
    // would rotate the token the first one is still waiting for.
    ensureSession() {
      if (!this.initializing) return Promise.resolve()
      restorePromise ??= this.restoreSession()
      return restorePromise
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
