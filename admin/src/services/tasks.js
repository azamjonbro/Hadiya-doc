import { http } from './http'

export const tasksApi = {
  listAssignedByMe(params) {
    return http.get('/tasks/assigned-by-me', { params }).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/tasks', payload).then((r) => r.data.data)
  },
}
