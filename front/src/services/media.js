import { http } from './http'

export const mediaApi = {
  list(params) {
    return http.get('/media', { params }).then((r) => r.data.data)
  },

  folders() {
    return http.get('/media/folders').then((r) => r.data.data)
  },

  // Where a file is actually used — asked for on demand rather than kept as
  // a counter, because a stale counter is what makes a delete button
  // dangerous (see the backend's mediaUsage.service.js).
  usage(id) {
    return http.get(`/media/${id}/usage`).then((r) => r.data.data)
  },

  update(id, payload) {
    return http.patch(`/media/${id}`, payload).then((r) => r.data.data)
  },

  remove(id, { force = false } = {}) {
    return http.delete(`/media/${id}`, { params: force ? { force: 'true' } : {} }).then((r) => r.data.data)
  },

  // Reports by default. `apply` deletes, and the API keeps that behind
  // SUPERADMIN.
  cleanup({ apply = false } = {}) {
    return http.post('/media/cleanup', null, { params: { apply: String(apply) } }).then((r) => r.data.data)
  },
}
