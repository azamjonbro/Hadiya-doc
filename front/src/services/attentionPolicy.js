import { http } from './http'

// Sending `null` for a field is how the caller says "stop setting this here
// and inherit it again" — the API treats null as an unset, not as a value.
export const attentionPolicyApi = {
  getGlobal() {
    return http.get('/attention-policy').then((r) => r.data.data)
  },
  updateGlobal(payload) {
    return http.put('/attention-policy', payload).then((r) => r.data.data)
  },
  getForCourse(courseId) {
    return http.get(`/courses/${courseId}/attention-policy`).then((r) => r.data.data)
  },
  updateForCourse(courseId, payload) {
    return http.put(`/courses/${courseId}/attention-policy`, payload).then((r) => r.data.data)
  },
  resetForCourse(courseId) {
    return http.delete(`/courses/${courseId}/attention-policy`).then((r) => r.data.data)
  },
}
