import { http } from './http'

export const apiKeysApi = {
  list() {
    return http.get('/api-keys').then((r) => r.data.data)
  },

  // The response is the only time the key exists outside the caller's own
  // storage — the platform keeps a hash and cannot show it again.
  create(payload) {
    return http.post('/api-keys', payload).then((r) => r.data.data)
  },

  revoke(id) {
    return http.delete(`/api-keys/${id}`).then((r) => r.data.data)
  },

  scopes() {
    return http.get('/api-keys/scopes').then((r) => r.data.data)
  },
}
