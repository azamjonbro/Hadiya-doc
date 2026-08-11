import { http } from './http'

export const notificationsApi = {
  list(params) {
    return http.get('/notifications', { params }).then((r) => r.data.data)
  },
  markRead(id) {
    return http.patch(`/notifications/${id}/read`).then((r) => r.data.data)
  },
  markAllRead() {
    return http.patch('/notifications/read-all').then((r) => r.data.data)
  },
}
