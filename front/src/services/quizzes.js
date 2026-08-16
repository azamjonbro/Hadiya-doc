import { http } from './http'

export const quizzesApi = {
  getQuiz(videoId) {
    return http.get(`/videos/${videoId}/quiz`).then((r) => r.data.data)
  },
  submitQuiz(videoId, answers) {
    return http.post(`/videos/${videoId}/quiz/submit`, { answers }).then((r) => r.data.data)
  },
  upsertQuiz(videoId, payload) {
    return http.put(`/videos/${videoId}/quiz`, payload).then((r) => r.data.data)
  },
  removeQuiz(videoId) {
    return http.delete(`/videos/${videoId}/quiz`).then((r) => r.data.data)
  },
  getAttemptsForUser(videoId, userId) {
    return http.get(`/videos/${videoId}/quiz/attempts/${userId}`).then((r) => r.data.data)
  },
}
