import { http } from './http'

export const assessmentsApi = {
  listByTopic(topicId) {
    return http.get(`/topics/${topicId}/assessments`).then((r) => r.data.data)
  },

  // Briefing only for a learner — title, question count, pass mark, time
  // limit and any sitting already in progress. The questions arrive from
  // start() and nowhere else.
  getById(id) {
    return http.get(`/assessments/${id}`).then((r) => r.data.data)
  },

  start(id) {
    return http.post(`/assessments/${id}/start`).then((r) => r.data.data)
  },

  // Sent every time the test tab loses focus, carrying whatever has been
  // answered so far so the server can grade immediately if this trips the
  // limit — the browser may never come back.
  reportFocusLoss(id, answers) {
    return http.post(`/assessments/${id}/focus-loss`, { answers }).then((r) => r.data.data)
  },

  submit(id, answers) {
    return http.post(`/assessments/${id}/submit`, { answers }).then((r) => r.data.data)
  },
}
