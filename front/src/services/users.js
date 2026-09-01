import { http } from './http'

export const usersApi = {
  learningStats(userId) {
    return http.get(`/users/${userId}/learning-stats`).then((r) => r.data.data)
  },

  list(params) {
    return http.get('/users', { params }).then((r) => r.data.data)
  },
  departments() {
    return http.get('/users/departments').then((r) => r.data.data)
  },
  branches() {
    return http.get('/users/branches').then((r) => r.data.data)
  },
  // Same branches, with what is attached to each — the admin branches page.
  branchOverview() {
    return http.get('/users/branches/overview').then((r) => r.data.data)
  },
  positions() {
    return http.get('/users/positions').then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/users/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/users', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/users/${id}`, payload).then((r) => r.data.data)
  },
  deactivate(id) {
    return http.delete(`/users/${id}`).then((r) => r.data.data)
  },

  // Bulk actions from the employees table. One request per action rather than
  // one per employee: the server decides who is eligible and answers with a
  // summary (sent/deactivated, skipped, failed) the table can report on.
  bulkMessage({ userIds, message }) {
    return http.post('/users/bulk/message', { userIds, message }).then((r) => r.data.data)
  },
  bulkDeactivate(userIds) {
    return http.post('/users/bulk/deactivate', { userIds }).then((r) => r.data.data)
  },
  getCourses(id) {
    return http.get(`/users/${id}/courses`).then((r) => r.data.data)
  },
  performance(id) {
    return http.get(`/users/${id}/performance`).then((r) => r.data.data)
  },
  activity(id, days) {
    return http.get(`/users/${id}/activity`, { params: { days } }).then((r) => r.data.data)
  },
  testResults(id) {
    return http.get(`/users/${id}/test-results`).then((r) => r.data.data)
  },
  tasks(id) {
    return http.get(`/users/${id}/tasks`).then((r) => r.data.data)
  },
}
