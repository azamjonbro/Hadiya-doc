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

/**
 * The minimum needed to render the shell offline: who this is and what
 * they are called. **Not permissions** — nothing is authorised from this,
 * and the API is unreachable anyway; it exists so an offline app can draw
 * a name instead of an empty header.
 */
const OFFLINE_PROFILE_KEY = 'lms-offline-profile'

function rememberForOffline(user) {
  try {
    localStorage.setItem(
      OFFLINE_PROFILE_KEY,
      JSON.stringify({ id: user.id, fullName: user.fullName, role: user.role, scope: user.scope })
    )
  } catch {
    // Storage refused (private window): offline reading is then unavailable,
    // which is the state it was in before this feature.
  }
}

function rememberedProfile() {
  try {
    const raw = localStorage.getItem(OFFLINE_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Permissions are deliberately empty: an offline session authorises
    // nothing, and a stale permission list is exactly the wrong thing to
    // restore from disk.
    return { ...parsed, permissions: [] }
  } catch {
    return null
  }
}

function forgetOffline() {
  try {
    localStorage.removeItem(OFFLINE_PROFILE_KEY)
  } catch {
    /* nothing to clear if storage was never writable */
  }
}

// Module-level, not store state: it is a promise, not something any component
// should be reading or that ought to end up in devtools' state tree.
let restorePromise = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    user: null,
    initializing: true,
    /**
     * A read-only session for offline reading (12.2).
     *
     * There is no way to obtain an access token with no network, so a cold
     * start offline would otherwise bounce straight to the login form —
     * making a course somebody deliberately downloaded unreachable, which
     * is the whole feature. In this mode the app renders and reads from
     * IndexedDB; **every API call still fails**, because there is no token
     * and no network, and coming back online re-authenticates properly.
     *
     * It grants nothing new: the content is already on this device,
     * readable in devtools by whoever holds it, and it was downloaded by
     * this person on purpose.
     */
    offlineOnly: false,
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    // Signed in enough to render, but with no token: offline reading only.
    canReadOffline: (state) => Boolean(state.offlineOnly && state.user),
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
      this.offlineOnly = false
      setCsrfToken(csrfToken)
      rememberForOffline(user)
      useChatStore().init(accessToken, user.id)
    },

    clearSession() {
      this.accessToken = null
      this.user = null
      this.offlineOnly = false
      clearCsrfToken()
      forgetOffline()
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
      // A second factor stands between a correct password and a session
      // (11.6) — the same shape as the face challenge, so this store stays
      // the only place that decides what "logged in" means.
      if (data.data.requiresTwoFactor) {
        return { requiresTwoFactor: true, twoFactorToken: data.data.twoFactorToken }
      }
      this.setSession(data.data)
      return { requiresFaceVerification: false }
    },

    /** Finishes a login that stopped at the second factor (11.6). */
    async completeTwoFactor(token, code) {
      const { securityApi } = await import('@/services/security')
      const session = await securityApi.verifyLogin(token, code)
      if (session.requiresFaceVerification) {
        return { requiresFaceVerification: true, verificationToken: session.verificationToken }
      }
      this.setSession(session)
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

    /**
     * Offline, with a profile remembered from the last real login: allow
     * reading what is stored, marked as such.
     */
    resumeOffline() {
      const remembered = rememberedProfile()
      if (!remembered) return false
      this.user = remembered
      this.accessToken = null
      this.offlineOnly = true
      return true
    },

    /**
     * When the network comes back, stop reading from storage and get a
     * real session (12.2).
     *
     * Without this the app would stay in read-only mode until the next
     * reload: every write would fail and the person would have no idea
     * why, having watched the connection return.
     */
    watchNetwork() {
      window.addEventListener('online', () => {
        if (!this.offlineOnly) return
        // A fresh attempt, not the cached one: `restoreSession` is
        // memoised through `ensureSession`, and this is a different moment.
        this.restoreSession().catch(() => {})
      })
    },

    // Silent session restore on app boot, using the httpOnly refresh cookie
    // from a previous login — lets a page reload keep the user signed in
    // without re-entering credentials.
    async restoreSession() {
      try {
        const { data } = await http.post('/auth/refresh', null, { headers: csrfHeader() })
        this.setSession(data.data)
      } catch (error) {
        /**
         * A refresh that failed because there is **no network** is not a
         * refused session (12.2): the cookie may be perfectly valid. So
         * offline, fall back to the read-only mode instead of signing
         * somebody out — clearing the session here would also delete the
         * remembered profile, and they would come back online logged out
         * for no reason.
         */
        const noNetwork = !error?.response && (navigator.onLine === false || error?.code === 'ERR_NETWORK')
        if (noNetwork && this.resumeOffline()) {
          this.initializing = false
          return
        }
        this.clearSession()
      } finally {
        this.initializing = false
      }
    },
  },
})
