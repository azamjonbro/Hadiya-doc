import { http } from './http'

export const tasksApi = {
  listMy(params) {
    return http.get('/tasks/my', { params }).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/tasks/${id}`, payload).then((r) => r.data.data)
  },
}
