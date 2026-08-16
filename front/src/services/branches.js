import { http } from './http'

export const branchesApi = {
  // Union of declared branches and names actually in use, with counts.
  overview() {
    return http.get('/branches').then((r) => r.data.data)
  },
  create(name) {
    return http.post('/branches', { name }).then((r) => r.data.data)
  },
  // Moves every tagged employee and course to the new name; the response says
  // how many of each were touched.
  rename(id, name) {
    return http.patch(`/branches/${id}`, { name }).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/branches/${id}`).then((r) => r.data.data)
  },
}
