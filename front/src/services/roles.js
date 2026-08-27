import { http } from './http'

// Roles are rows in a collection, not a fixed enum — the six seeded ones are
// simply the rows that ship with the app. Listing needs user:read; creating
// and deleting need role:manage, which only SUPERADMIN holds.
export const rolesApi = {
  list() {
    return http.get('/roles').then((r) => r.data.data)
  },
  create(name) {
    return http.post('/roles', { name }).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/roles/${id}`).then((r) => r.data.data)
  },
}
