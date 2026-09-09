import { http } from './http'

/**
 * The authoring API. Everything here returns questions *with* their answer
 * keys, which is why every route behind it requires quiz:configure — what a
 * learner sees comes from the sitting endpoints instead.
 */
export const questionsApi = {
  banks(params = {}) {
    return http.get('/questions/banks', { params }).then((r) => r.data.data.items)
  },
  createBank(payload) {
    return http.post('/questions/banks', payload).then((r) => r.data.data)
  },
  updateBank(id, payload) {
    return http.patch(`/questions/banks/${id}`, payload).then((r) => r.data.data)
  },
  deleteBank(id) {
    return http.delete(`/questions/banks/${id}`).then((r) => r.data.data)
  },

  list(params = {}) {
    return http.get('/questions', { params }).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/questions', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/questions/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/questions/${id}`).then((r) => r.data.data)
  },
}

export const quizzesApi = {
  list(params = {}) {
    return http.get('/quizzes', { params }).then((r) => r.data.data.items)
  },
  getById(id) {
    return http.get(`/quizzes/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/quizzes', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/quizzes/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/quizzes/${id}`).then((r) => r.data.data)
  },
  stats(id) {
    return http.get(`/quizzes/${id}/stats`).then((r) => r.data.data)
  },

  // Sitting one, for the learner-facing player.
  start(id) {
    return http.post(`/quizzes/${id}/start`).then((r) => r.data.data)
  },
  submit(id, sessionId, answers) {
    return http.post(`/quizzes/${id}/submit`, { sessionId, answers }).then((r) => r.data.data)
  },
  summary(id) {
    return http.get(`/quizzes/${id}/summary`).then((r) => r.data.data)
  },
  review(attemptId) {
    return http.get(`/quizzes/attempts/${attemptId}`).then((r) => r.data.data)
  },
  reportFocusLoss(sessionId) {
    return http.post(`/quizzes/sessions/${sessionId}/focus-loss`).then((r) => r.data.data)
  },
}
