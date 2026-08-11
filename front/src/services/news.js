import { http } from './http'

export const newsApi = {
  feed(params) {
    return http.get('/news/feed', { params }).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/news/${id}`).then((r) => r.data.data)
  },
}
