import { http } from './http'

// The knowledge base (portal §5): categories are the "spaces" a reader
// browses, articles live inside them. Reading is open to every employee;
// writing is gated on news:manage by the API.
export const kbApi = {
  categories() {
    return http.get('/kb/categories').then((r) => r.data.data.items)
  },
  createCategory(payload) {
    return http.post('/kb/categories', payload).then((r) => r.data.data)
  },
  list(params) {
    return http.get('/kb', { params }).then((r) => r.data.data.items)
  },
  getBySlug(slug) {
    return http.get(`/kb/${slug}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/kb', payload).then((r) => r.data.data)
  },
  rate(id, helpful) {
    return http.post(`/kb/${id}/rate`, { helpful }).then((r) => r.data.data)
  },
  comments(id) {
    return http.get(`/kb/${id}/comments`).then((r) => r.data.data.items)
  },
  comment(id, payload) {
    return http.post(`/kb/${id}/comments`, payload).then((r) => r.data.data)
  },
  // Rasn 18–19 (news:manage): the content analytics and the trash.
  analytics() {
    return http.get('/kb/analytics').then((r) => r.data.data)
  },
  trash() {
    return http.get('/kb/trash').then((r) => r.data.data.items)
  },
  restore(id) {
    return http.post(`/kb/${id}/restore`).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/kb/${id}`).then((r) => r.data.data)
  },
}
