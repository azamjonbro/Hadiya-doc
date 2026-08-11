import { http } from './http'

export const usersApi = {
  list(params) {
    return http.get('/users', { params }).then((r) => r.data.data)
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
}
