import { http } from './http'

export const trashApi = {
  list() {
    return http.get('/trash').then((r) => r.data.data)
  },
  restore(type, id) {
    return http.post(`/trash/${type}/${id}/restore`).then((r) => r.data.data)
  },
  // Emptying the bin early — SUPERADMIN only, server-side.
  destroy(type, id) {
    return http.delete(`/trash/${type}/${id}`).then((r) => r.data.data)
  },
}
