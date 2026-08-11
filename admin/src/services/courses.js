import { http } from './http'

export const coursesApi = {
  list(params) {
    return http.get('/courses', { params }).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/courses/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/courses', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/courses/${id}`, payload).then((r) => r.data.data)
  },
  archive(id) {
    return http.delete(`/courses/${id}`).then((r) => r.data.data)
  },
  listTopics(id) {
    return http.get(`/courses/${id}/topics`).then((r) => r.data.data)
  },
  createTopic(id, payload) {
    return http.post(`/courses/${id}/topics`, payload).then((r) => r.data.data)
  },
}
