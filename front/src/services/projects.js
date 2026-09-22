import { http } from './http'

// Projects: folders for the admin library (rasm «Проекты»). A course is
// filed into one through `coursesApi.update(id, { projectId })`; this API
// only manages the folders and who works in them.
export const projectsApi = {
  list() {
    return http.get('/projects').then((r) => r.data.data.items)
  },
  getById(id) {
    return http.get(`/projects/${id}`).then((r) => r.data.data)
  },
  // Named by the server after its owner when no name is given — the
  // reference's "+" makes «Новый проект (Ism Familiya)» and opens the
  // rename dialog over it.
  create(payload = {}) {
    return http.post('/projects', payload).then((r) => r.data.data)
  },
  rename(id, name) {
    return http.patch(`/projects/${id}`, { name }).then((r) => r.data.data)
  },
  // The folder goes; its courses fall back into the general library.
  remove(id) {
    return http.delete(`/projects/${id}`).then((r) => r.data.data)
  },
  // Colleagues who could be added — name cards, no user:read needed.
  candidates(params) {
    return http.get('/projects/candidates', { params }).then((r) => r.data.data.items)
  },
  addMembers(id, userIds, access) {
    return http.post(`/projects/${id}/members`, { userIds, access }).then((r) => r.data.data)
  },
  setMemberAccess(id, userId, access) {
    return http.patch(`/projects/${id}/members/${userId}`, { access }).then((r) => r.data.data)
  },
  removeMember(id, userId) {
    return http.delete(`/projects/${id}/members/${userId}`).then((r) => r.data.data)
  },
}
