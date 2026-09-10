import { http } from './http'

export const competenciesApi = {
  list(params = {}) {
    return http.get('/competencies', { params }).then((r) => r.data.data.items)
  },
  get(id) {
    return http.get(`/competencies/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/competencies', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/competencies/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/competencies/${id}`).then((r) => r.data.data)
  },
  matrix(params = {}) {
    return http.get('/competencies/matrix', { params }).then((r) => r.data.data)
  },
  forUser(userId) {
    return http.get(`/competencies/users/${userId}`).then((r) => r.data.data)
  },
  // The signed-in person's own levels — the only competency route open to
  // somebody with neither permission.
  mine() {
    return http.get('/competencies/mine').then((r) => r.data.data)
  },
  assess(payload) {
    return http.post('/competencies/assessments', payload).then((r) => r.data.data)
  },
}
