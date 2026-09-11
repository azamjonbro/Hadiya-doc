import { http } from './http'

export const newsApi = {
  feed(params) {
    return http.get('/news/feed', { params }).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/news/${id}`).then((r) => r.data.data)
  },
  // Portal §3. Toggle: the answer is the new state and the new count.
  toggleLike(id) {
    return http.post(`/news/${id}/like`).then((r) => r.data.data)
  },
  comments(id) {
    return http.get(`/news/${id}/comments`).then((r) => r.data.data.items)
  },
  comment(id, body) {
    return http.post(`/news/${id}/comments`, { body }).then((r) => r.data.data)
  },
  // Moderation (news:manage): every comment, newest first, paged.
  allComments(params) {
    return http.get('/news/comments', { params }).then((r) => r.data.data)
  },
  removeComment(id, commentId) {
    return http.delete(`/news/${id}/comments/${commentId}`).then((r) => r.data.data)
  },

  list(params) {
    return http.get('/news', { params }).then((r) => r.data.data)
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
