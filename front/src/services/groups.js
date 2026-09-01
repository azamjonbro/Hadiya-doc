import { http } from './http'

export const groupsApi = {
  list(params) {
    return http.get('/groups', { params }).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/groups/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/groups', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/groups/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/groups/${id}`).then((r) => r.data.data)
  },
  addMembers(id, userIds) {
    return http.post(`/groups/${id}/members`, { userIds }).then((r) => r.data.data)
  },
  removeMember(id, userId) {
    return http.delete(`/groups/${id}/members/${userId}`).then((r) => r.data.data)
  },

  // Roster changes for a whole selection. These answer with a summary
  // ({ group, added/removed, alreadyMemberIds, notMemberIds, notFoundIds })
  // rather than with the group alone, so the employees page can say what it
  // actually did instead of guessing.
  bulkAddMembers(id, userIds) {
    return http.post(`/groups/${id}/members/bulk-add`, { userIds }).then((r) => r.data.data)
  },
  bulkRemoveMembers(id, userIds) {
    return http.post(`/groups/${id}/members/bulk-remove`, { userIds }).then((r) => r.data.data)
  },
  addCourses(id, courseIds) {
    return http.post(`/groups/${id}/courses`, { courseIds }).then((r) => r.data.data)
  },
  removeCourse(id, courseId) {
    return http.delete(`/groups/${id}/courses/${courseId}`).then((r) => r.data.data)
  },
}
