import { http } from './http'

export const ssoApi = {
  // What the login page needs before drawing anything: whether SSO is
  // available at all, and what the button should say.
  status() {
    return http.get('/auth/sso/status').then((r) => r.data.data)
  },

  // Returns the provider's URL rather than redirecting — a 302 to another
  // origin inside a fetch lands as an opaque CORS failure, so the
  // navigation has to happen here.
  start(redirect) {
    return http
      .get('/auth/sso/start', { params: redirect ? { redirect } : {} })
      .then((r) => r.data.data.url)
  },

  // The handoff code from the callback URL, traded for a real session.
  exchange(code) {
    return http.post('/auth/sso/exchange', { code }).then((r) => r.data.data)
  },
}
