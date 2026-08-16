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
  create(payload) {
    return http.post('/courses', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/courses/${id}`, payload).then((r) => r.data.data)
  },
  // Retired but still listed — a milder state than the trash below.
  archive(id) {
    return http.post(`/courses/${id}/archive`).then((r) => r.data.data)
  },
  // What the delete button does: the course leaves every listing and waits on
  // the trash page until it is restored or destroyed.
  remove(id) {
    return http.delete(`/courses/${id}`).then((r) => r.data.data)
  },
  listTrash() {
    return http.get('/courses/trash').then((r) => r.data.data)
  },
  restore(id) {
    return http.post(`/courses/${id}/restore`).then((r) => r.data.data)
  },
  // Emptying the bin: irreversible, SUPERADMIN-only server-side, and it takes
  // the course's topics, videos and analytics with it.
  destroy(id) {
    return http.delete(`/courses/${id}/permanent`).then((r) => r.data.data)
  },
  createTopic(id, payload) {
    return http.post(`/courses/${id}/topics`, payload).then((r) => r.data.data)
  },
  listAssignments(id) {
    return http.get(`/courses/${id}/assignments`).then((r) => r.data.data)
  },
  getUserProgress(id, userId) {
    return http.get(`/courses/${id}/users/${userId}/progress`).then((r) => r.data.data)
  },
  assign(id, payload) {
    return http.post(`/courses/${id}/assignments`, payload).then((r) => r.data.data)
  },
}
