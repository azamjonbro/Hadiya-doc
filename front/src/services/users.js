import { http } from './http'

export const usersApi = {
  learningStats(userId) {
    return http.get(`/users/${userId}/learning-stats`).then((r) => r.data.data)
  },
}
