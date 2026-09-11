import { http } from './http'

/**
 * Auto-assignment rules (Kirishni boshqarish → Avto-tayinlash). A rule is
 * created switched off and turned on deliberately; `run` applies it now
 * rather than waiting for the nightly sweep.
 */
export const enrollmentRulesApi = {
  list() {
    return http.get('/enrollment-rules').then((r) => r.data.data.items)
  },
  create(payload) {
    return http.post('/enrollment-rules', payload).then((r) => r.data.data.rule)
  },
  update(id, payload) {
    return http.patch(`/enrollment-rules/${id}`, payload).then((r) => r.data.data.rule)
  },
  remove(id) {
    return http.delete(`/enrollment-rules/${id}`).then((r) => r.data.data)
  },
  preview(id) {
    return http.get(`/enrollment-rules/${id}/preview`).then((r) => r.data.data)
  },
  run(id) {
    return http.post(`/enrollment-rules/${id}/run`).then((r) => r.data.data)
  },
}
