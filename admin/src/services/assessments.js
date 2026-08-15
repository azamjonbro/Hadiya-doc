import { http } from './http'

export const assessmentsApi = {
  listByTopic(topicId) {
    return http.get(`/topics/${topicId}/assessments`).then((r) => r.data.data)
  },
  create(topicId, payload) {
    return http.post(`/topics/${topicId}/assessments`, payload).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/assessments/${id}`).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.put(`/assessments/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/assessments/${id}`).then((r) => r.data.data)
  },
}
