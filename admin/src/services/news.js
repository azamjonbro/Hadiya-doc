import { http } from './http'

export const newsApi = {
  list(params) {
    return http.get('/news', { params }).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/news/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/news', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/news/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/news/${id}`).then((r) => r.data.data)
  },
}
