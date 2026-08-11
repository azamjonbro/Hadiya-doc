import { http } from './http'

export const videosApi = {
  listByTopic(topicId) {
    return http.get(`/topics/${topicId}/videos`).then((r) => r.data.data)
  },
}
