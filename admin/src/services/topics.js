import { http } from './http'

export const topicsApi = {
  update(id, payload) {
    return http.patch(`/topics/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/topics/${id}`).then((r) => r.data.data)
  },
}
