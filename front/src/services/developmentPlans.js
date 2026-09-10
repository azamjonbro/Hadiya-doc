import { http } from './http'

export const developmentPlansApi = {
  list(params = {}) {
    return http.get('/development-plans', { params }).then((r) => r.data.data)
  },
  mine() {
    return http.get('/development-plans/mine').then((r) => r.data.data.items)
  },
  due(params = {}) {
    return http.get('/development-plans/due', { params }).then((r) => r.data.data.items)
  },
  get(id) {
    return http.get(`/development-plans/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/development-plans', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/development-plans/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/development-plans/${id}`).then((r) => r.data.data)
  },
  addGoal(id, payload) {
    return http.post(`/development-plans/${id}/goals`, payload).then((r) => r.data.data)
  },
  updateGoal(id, goalId, payload) {
    return http.patch(`/development-plans/${id}/goals/${goalId}`, payload).then((r) => r.data.data)
  },
  removeGoal(id, goalId) {
    return http.delete(`/development-plans/${id}/goals/${goalId}`).then((r) => r.data.data)
  },
  // Only ever called for OJT and CUSTOM goals — the API refuses the rest
  // with GOAL_PROGRESS_DERIVED, and the views hide the control accordingly.
  setGoalProgress(id, goalId, payload) {
    return http.post(`/development-plans/${id}/goals/${goalId}/progress`, payload).then((r) => r.data.data)
  },
  review(id, payload) {
    return http.post(`/development-plans/${id}/review`, payload).then((r) => r.data.data)
  },
  // Paying CPE credits without a full review, for a goal finished after the
  // plan was approved. Idempotent per goal — a second click credits nothing
  // more — but it is still shown behind a confirm dialog, because the person
  // pressing it cannot know that.
  accrue(id) {
    return http.post(`/development-plans/${id}/credits`).then((r) => r.data.data)
  },
  // The competency gaps (13.1) a plan for this person would be written
  // against, each carrying the courses that close it.
  suggestions(userId) {
    return http.get(`/development-plans/suggestions/${userId}`).then((r) => r.data.data)
  },
}
