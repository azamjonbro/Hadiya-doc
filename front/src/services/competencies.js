import { http } from './http'

export const competenciesApi = {
  list(params = {}) {
    return http.get('/competencies', { params }).then((r) => r.data.data.items)
  },
  get(id) {
    return http.get(`/competencies/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/competencies', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/competencies/${id}`, payload).then((r) => r.data.data)
  },
  // Profiles (rasm: «Профили компетенций») and catalogue folders.
  profiles() {
    return http.get('/competencies/profiles').then((r) => r.data.data.items)
  },
  createProfile(payload) {
    return http.post('/competencies/profiles', payload).then((r) => r.data.data.profile)
  },
  updateProfile(id, payload) {
    return http.patch(`/competencies/profiles/${id}`, payload).then((r) => r.data.data.profile)
  },
  removeProfile(id) {
    return http.delete(`/competencies/profiles/${id}`).then((r) => r.data.data)
  },
  folders() {
    return http.get('/competencies/folders').then((r) => r.data.data.items)
  },
  createFolder(payload) {
    return http.post('/competencies/folders', payload).then((r) => r.data.data.folder)
  },
  updateFolder(id, payload) {
    return http.patch(`/competencies/folders/${id}`, payload).then((r) => r.data.data.folder)
  },
  removeFolder(id) {
    return http.delete(`/competencies/folders/${id}`).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/competencies/${id}`).then((r) => r.data.data)
  },
  matrix(params = {}) {
    return http.get('/competencies/matrix', { params }).then((r) => r.data.data)
  },
  forUser(userId) {
    return http.get(`/competencies/users/${userId}`).then((r) => r.data.data)
  },
  // The signed-in person's own levels — the only competency route open to
  // somebody with neither permission.
  mine() {
    return http.get('/competencies/mine').then((r) => r.data.data)
  },
  assess(payload) {
    return http.post('/competencies/assessments', payload).then((r) => r.data.data)
  },
}
