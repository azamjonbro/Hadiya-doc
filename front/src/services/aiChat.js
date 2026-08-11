import { http } from './http'

export const aiChatApi = {
  history({ courseId, topicId, videoId }) {
    return http
      .get('/ai-chat/history', { params: { courseId, topicId: topicId ?? undefined, videoId: videoId ?? undefined } })
      .then((r) => r.data.data)
  },
  send({ courseId, topicId, videoId, message }) {
    return http.post('/ai-chat/messages', { courseId, topicId: topicId ?? null, videoId: videoId ?? null, message }).then((r) => r.data.data)
  },
}
