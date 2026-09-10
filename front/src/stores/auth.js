import { defineStore } from 'pinia'
import { http, csrfHeader, setCsrfToken, clearCsrfToken } from '@/services/http'
import { faceApi } from '@/services/face'
import { useChatStore } from './chat'

// Who may open the admin area at all.
//
// A permission list, not a role list. The acceptance for 2.5 is that what a
// person sees in the UI is what they can get from the API — and the API
// answers on permissions, so the door has to as well. Holding one of these
// means at least one admin page has something to show; each page then
// enforces its own `meta.permission`, and each endpoint its own check.
//
// Kept next to the store rather than in the router so the guard and the nav
// agree on one definition.
const ADMIN_APP_PERMISSIONS = [
  'user:read',
  'course:read',
  'news:read',
  'task:create',
  'report:export',
  'analytics:view:all',
  'chat:support',
  'audit:read',
  'role:manage',
  'course:delete',
]

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
    canUseAdminApp: (state) =>
      ADMIN_APP_PERMISSIONS.some((permission) => (state.user?.permissions ?? []).includes(permission)),
    // How far this person can see — ALL, DEPARTMENT, TEAM or SELF (2.2).
    // The dashboard routes on it: a scoped user asking for the company-wide
    // page is sent to their team's instead of collecting a 403.
    scope: (state) => state.user?.scope ?? 'SELF',
    isScoped: (state) => (state.user?.scope ?? 'SELF') !== 'ALL',
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

    /**
     * Finishes a single sign-on login (11.4).
     *
     * The code came back in the callback URL; the API turns it into
     * exactly what `POST /auth/login` returns, including the face
     * challenge case, so this store keeps being the only place that
     * decides what "logged in" means.
     */
    async completeSso(code) {
      const { ssoApi } = await import('@/services/sso')
      const session = await ssoApi.exchange(code)
      if (session.requiresFaceVerification) {
        return { requiresFaceVerification: true, verificationToken: session.verificationToken }
      }
      this.setSession(session)
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
