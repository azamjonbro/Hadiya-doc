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
  // `force` deletes a branch that still has employees or courses in it: they
  // are detached first (employees left with no branch, the name pulled out of
  // every course that targets it). Without it the server refuses with
  // BRANCH_IN_USE. The admin page confirms the counts before passing it.
  remove(id, { force = false } = {}) {
    return http.delete(`/branches/${id}`, { params: force ? { force: 1 } : {} }).then((r) => r.data.data)
  },
  // A branch that was only ever typed into an employee's record has no id;
  // its name is the only handle there is.
  removeByName(name, { force = false } = {}) {
    return http
      .delete('/branches/by-name', { params: { name, ...(force ? { force: 1 } : {}) } })
      .then((r) => r.data.data)
  },
}
