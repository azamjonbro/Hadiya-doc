/**
 * A role name the way a person reads it — "Call-markaz operatori", not
 * CALL_OPERATOR. The nine seeded roles have translations; a role somebody
 * created is shown by the words they typed ("Bosh hisobchi"), which the
 * API returns as `label` beside the key it became (BOSH_HISOBCHI).
 *
 * The labels are remembered here from every `rolesApi.list()` (the
 * service registers them), so a table that only has the key — the
 * employees list, a chat roster — still shows the words once the
 * catalogue has been loaded anywhere in the session.
 */
const customLabels = new Map()

export function registerRoleLabels(roles) {
  for (const role of roles ?? []) {
    if (role?.name && role.label) customLabels.set(role.name, role.label)
  }
}

export function roleLabel(name, { t, te }) {
  if (!name) return ''
  const key = `roles.names.${name}`
  if (te(key)) return t(key)
  return customLabels.get(name) ?? name
}

/** Same idea for a permission key ('user:read') and a module ('user'). */
export function permissionLabel(key, { t, te }) {
  const path = `roles.permissionLabels.${key}`
  return te(path) ? t(path) : key
}

export function moduleLabel(module, { t, te }) {
  const path = `roles.modules.${module}`
  return te(path) ? t(path) : module
}
