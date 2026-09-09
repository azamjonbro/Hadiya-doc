import { http } from './http'

export const pathsApi = {
  list(params = {}) {
    return http.get('/paths', { params }).then((r) => r.data.data.items)
  },
  getById(id) {
    return http.get(`/paths/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/paths', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/paths/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/paths/${id}`).then((r) => r.data.data)
  },
  // Joining one yourself, as opposed to being put on it by somebody else.
  enroll(id) {
    return http.post(`/paths/${id}/enroll`).then((r) => r.data.data)
  },
  assign(id, payload) {
    return http.post(`/paths/${id}/assign`, payload).then((r) => r.data.data)
  },
  enrollments(id) {
    return http.get(`/paths/${id}/enrollments`).then((r) => r.data.data.items)
  },
}
