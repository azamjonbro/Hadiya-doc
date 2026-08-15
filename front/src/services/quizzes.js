import { http } from './http'

export const quizzesApi = {
  getQuiz(videoId) {
    return http.get(`/videos/${videoId}/quiz`).then((r) => r.data.data)
  },
  submitQuiz(videoId, answers) {
    return http.post(`/videos/${videoId}/quiz/submit`, { answers }).then((r) => r.data.data)
  },
}
