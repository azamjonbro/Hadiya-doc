import { http } from './http'

export const courseQuestionsApi = {
  list(courseId, params) {
    return http.get(`/courses/${courseId}/questions`, { params }).then((r) => r.data.data)
  },
  create(courseId, payload) {
    return http.post(`/courses/${courseId}/questions`, payload).then((r) => r.data.data)
  },
  answer(courseId, questionId, payload) {
    return http.post(`/courses/${courseId}/questions/${questionId}/answers`, payload).then((r) => r.data.data)
  },
  remove(courseId, questionId) {
    return http.delete(`/courses/${courseId}/questions/${questionId}`).then((r) => r.data.data)
  },
}
