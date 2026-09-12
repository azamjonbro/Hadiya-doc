/**
 * A role name the way a person reads it — "Call-markaz operatori", not
 * CALL_OPERATOR. The nine seeded roles have translations; a role somebody
 * created on the roles page is shown by the name they gave it.
 */
export function roleLabel(name, { t, te }) {
  if (!name) return ''
  const key = `roles.names.${name}`
  return te(key) ? t(key) : name
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
