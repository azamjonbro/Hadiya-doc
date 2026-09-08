import { http } from './http'

// Roles are rows in a collection, not a fixed enum — the six seeded ones are
// simply the rows that ship with the app. Listing needs user:read; creating
// and deleting need role:manage, which only SUPERADMIN holds.
export const rolesApi = {
  list() {
    return http.get('/roles').then((r) => r.data.data)
  },
  create(name, scope) {
    return http.post('/roles', { name, ...(scope ? { scope } : {}) }).then((r) => r.data.data)
  },
  // The catalogue the permission grid renders its columns from, grouped by
  // module.
  permissions() {
    return http.get('/roles/permissions').then((r) => r.data.data)
  },
  // The permission list is the complete set for the role, not a delta — a
  // grid of checkboxes has no notion of "unchanged".
  update(id, { permissions, scope }) {
    return http
      .patch(`/roles/${id}`, {
        ...(permissions === undefined ? {} : { permissions }),
        ...(scope === undefined ? {} : { scope }),
      })
      .then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/roles/${id}`).then((r) => r.data.data)
  },
}
