import { http } from './http'

export const coursesApi = {
  list(params) {
    return http.get('/courses', { params }).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/courses/${id}`).then((r) => r.data.data)
  },
  listTopics(id) {
    return http.get(`/courses/${id}/topics`).then((r) => r.data.data)
  },
  getMyProgress(id) {
    return http.get(`/courses/${id}/progress`).then((r) => r.data.data)
  },
  myAssignments(userId) {
    return http.get(`/users/${userId}/courses`).then((r) => r.data.data)
  },
  enroll(id) {
    return http.post(`/courses/${id}/enroll`).then((r) => r.data.data)
  },
  // The merged attention rules this course is played under — defaults, global
  // policy and any course override already resolved server-side.
  attentionPolicy(id) {
    return http.get(`/courses/${id}/attention-policy/effective`).then((r) => r.data.data)
  },
}
