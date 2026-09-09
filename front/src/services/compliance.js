import { http } from './http'

export const complianceApi = {
  rules() {
    return http.get('/compliance').then((r) => r.data.data.items)
  },
  create(payload) {
    return http.post('/compliance', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/compliance/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/compliance/${id}`).then((r) => r.data.data)
  },
  run(id) {
    return http.post(`/compliance/${id}/run`).then((r) => r.data.data)
  },
  matrix() {
    return http.get('/compliance/matrix').then((r) => r.data.data)
  },
}
