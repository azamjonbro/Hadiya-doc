import { http } from './http'

/** Two-factor authentication and the caller's own sessions (11.6). */
export const securityApi = {
  twoFactorStatus() {
    return http.get('/auth/2fa/status').then((r) => r.data.data)
  },

  // Returns the secret, its otpauth URI and a QR data URL — shown once.
  beginSetup() {
    return http.post('/auth/2fa/setup').then((r) => r.data.data)
  },

  // The response carries the recovery codes, and nothing can show them
  // again: the platform keeps hashes.
  enable(code) {
    return http.post('/auth/2fa/enable', { code }).then((r) => r.data.data)
  },

  disable(code) {
    return http.post('/auth/2fa/disable', { code }).then((r) => r.data.data)
  },

  regenerateRecoveryCodes(code) {
    return http.post('/auth/2fa/recovery-codes', { code }).then((r) => r.data.data)
  },

  // The second step of a login: no session exists yet, so this carries the
  // challenge token from /auth/login rather than an Authorization header.
  verifyLogin(token, code) {
    return http.post('/auth/2fa/verify', { token, code }).then((r) => r.data.data)
  },

  sessions() {
    return http.get('/auth/sessions').then((r) => r.data.data)
  },

  revokeSession(id) {
    return http.delete(`/auth/sessions/${id}`).then((r) => r.data.data)
  },

  revokeOtherSessions() {
    return http.delete('/auth/sessions/others').then((r) => r.data.data)
  },
}
