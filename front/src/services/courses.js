import { http } from './http'

export const coursesApi = {
  list(params) {
    return http.get('/courses', { params }).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/courses/${id}`).then((r) => r.data.data)
  },
  listTopics(id) {
    return http.get(`/courses/${id}/topics`).then((r) => r.data.data)
  },
  myAssignments(userId) {
    return http.get(`/users/${userId}/courses`).then((r) => r.data.data)
  },
}
