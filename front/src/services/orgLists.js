import { http } from './http'

// The four curated dropdowns behind the employee form — positions,
// departments, subdivisions, countries. `type` is one of ORG_LIST_TYPES from
// @lms/shared; the API rejects anything else.
export const orgListsApi = {
  list(type) {
    return http.get(`/org-lists/${type}`).then((r) => r.data.data)
  },
  create(type, name, extra = {}) {
    return http.post(`/org-lists/${type}`, { name, ...extra }).then((r) => r.data.data)
  },
  update(type, id, payload) {
    return http.patch(`/org-lists/${type}/${id}`, payload).then((r) => r.data.data)
  },
  remove(type, id) {
    return http.delete(`/org-lists/${type}/${id}`).then((r) => r.data.data)
  },
}
