import { http } from './http'
import { registerRoleLabels } from '@/utils/roleLabel'

// Roles are rows in a collection, not a fixed enum — the six seeded ones are
// simply the rows that ship with the app. Listing needs user:read; creating
// and deleting need role:manage, which only SUPERADMIN holds.
export const rolesApi = {
  list() {
    return http.get('/roles').then((r) => {
      registerRoleLabels(r.data.data)
      return r.data.data
    })
  },
  // `{ name, scope, description, permissions }` — the editor page saves the
  // whole role at once.
  create(payload) {
    const body = typeof payload === 'string' ? { name: payload } : payload
    return http.post('/roles', body).then((r) => {
      registerRoleLabels([r.data.data])
      return r.data.data
    })
  },
  // The catalogue the permission grid renders its columns from, grouped by
  // module.
  permissions() {
    return http.get('/roles/permissions').then((r) => r.data.data)
  },
  // The permission list is the complete set for the role, not a delta — a
  // grid of checkboxes has no notion of "unchanged".
  update(id, { permissions, scope, label, description }) {
    return http
      .patch(`/roles/${id}`, {
        ...(permissions === undefined ? {} : { permissions }),
        ...(scope === undefined ? {} : { scope }),
        ...(label === undefined ? {} : { label }),
        ...(description === undefined ? {} : { description }),
      })
      .then((r) => {
        registerRoleLabels([r.data.data])
        return r.data.data
      })
  },
  remove(id) {
    return http.delete(`/roles/${id}`).then((r) => r.data.data)
  },
}
