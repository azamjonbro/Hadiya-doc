import { http } from './http'

export const videosApi = {
  listByTopic(topicId) {
    return http.get(`/topics/${topicId}/videos`).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/videos/${id}`).then((r) => r.data.data)
  },
  getStatus(id) {
    return http.get(`/videos/${id}/status`).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/videos/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/videos/${id}`).then((r) => r.data.data)
  },
}
