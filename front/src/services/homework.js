import { http } from './http'

/**
 * Homework. Named `homework` rather than `assignments` because
 * `/assignments` already means course-to-person assignment — the same
 * collision the API takes care to avoid.
 */
export const homeworkApi = {
  list(params = {}) {
    return http.get('/homework', { params }).then((r) => r.data.data.items)
  },
  create(payload) {
    return http.post('/homework', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/homework/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/homework/${id}`).then((r) => r.data.data)
  },

  // The learner's side.
  mine(id) {
    return http.get(`/homework/${id}/mine`).then((r) => r.data.data)
  },
  saveDraft(id, payload) {
    return http.post(`/homework/${id}/draft`, payload).then((r) => r.data.data)
  },
  submit(id, payload) {
    return http.post(`/homework/${id}/submit`, payload).then((r) => r.data.data)
  },

  // The reviewer's side.
  queue(params = {}) {
    return http.get('/homework/queue', { params }).then((r) => r.data.data.items)
  },
  submission(id) {
    return http.get(`/homework/submissions/${id}`).then((r) => r.data.data)
  },
  grade(id, payload) {
    return http.post(`/homework/submissions/${id}/grade`, payload).then((r) => r.data.data)
  },

  rubrics() {
    return http.get('/homework/rubrics').then((r) => r.data.data.items)
  },
}
