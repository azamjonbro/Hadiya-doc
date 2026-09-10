/**
 * Every route this app actually serves, read off the Express stack (11.3).
 *
 * The alternative — a hand-written list of endpoints beside the routers —
 * is wrong within a month, and wrong in the worst way: it documents an
 * endpoint that was renamed and omits the three that were added. Walking
 * the router stack means the document cannot claim anything the app does
 * not serve, and cannot miss anything it does.
 *
 * Express 4 keeps the mount prefix as a regexp on each layer rather than as
 * the string it was mounted with, so the prefix has to be recovered from
 * `layer.regexp` — see `prefixOf`. That is the one fragile part of this
 * file, and it is fragile against an Express **major** version rather than
 * against our own changes, which is the right way round: our routers change
 * weekly, Express 4 does not.
 */

/** `/^\/api\/v1\/?(?=\/|$)/i` → `/api/v1`. */
function prefixOf(layer) {
  // A prefix-less `app.use(router)` reports its path as '/', which must
  // read as "no prefix" — otherwise every route in that router is
  // documented one slash too deep (`//openapi.json`).
  if (layer.path && layer.path !== '/') return layer.path
  const source = layer.regexp?.source
  if (!source || source === '^\\/?(?=\\/|$)') return ''
  const match = /^\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)$/.exec(source)
  if (!match) return ''
  return `/${match[1].replace(/\\\//g, '/').replace(/\\\./g, '.')}`
}

/** `:id` stays `:id` here; the OpenAPI layer turns it into `{id}`. */
function joinPath(prefix, path) {
  const joined = `${prefix}${path === '/' ? '' : path}`.replace(/\/{2,}/g, '/')
  return joined === '' ? '/' : joined
}

/**
 * Reads the metadata the middlewares tagged themselves with.
 *
 * Everything the document says about a route — which token opens it, which
 * permission it needs, what the body must look like — comes from the
 * handlers that actually enforce it. Nothing here is a second opinion.
 */
function collectMeta(handlers) {
  const meta = {
    security: [],
    permissions: [],
    permissionMode: 'all',
    roles: [],
    body: null,
    query: null,
    params: null,
    response: null,
    idempotency: null,
  }
  for (const handler of handlers) {
    const tag = handler?.openapi
    if (!tag) continue
    if (tag.kind === 'security' && !meta.security.includes(tag.scheme)) meta.security.push(tag.scheme)
    if (tag.kind === 'permission') {
      meta.permissions.push(...tag.permissions)
      // `any` wins: a route gated by "one of these" must not be described
      // as needing all of them.
      if (tag.mode === 'any') meta.permissionMode = 'any'
    }
    if (tag.kind === 'role') meta.roles.push(...tag.roles)
    if (tag.kind === 'body') meta.body = tag.schema
    if (tag.kind === 'query') meta.query = tag.schema
    if (tag.kind === 'params') meta.params = tag.schema
    // The handful of routes that answer with something other than the
    // envelope (the spec itself, the docs page) say so on the handler.
    if (tag.kind === 'response') meta.response = tag
    // Which endpoints honour `Idempotency-Key` (11.5) — read off the
    // middleware that implements it, so the document cannot claim it on a
    // route that does not.
    if (tag.kind === 'idempotency') meta.idempotency = tag
  }
  return meta
}

/**
 * Walks one router, carrying down both the prefix and the metadata of any
 * middleware mounted with `router.use(...)`.
 *
 * The inherited part matters: `webhooksRouter.use(authenticate)` and
 * `webhooksRouter.use(requireRole(SUPERADMIN))` guard every route in that
 * file without appearing on any of them, and a document that ignored
 * router-level `use` would describe the whole file as public.
 */
function walk(layers, prefix, inherited, out) {
  const pending = { ...inherited }
  for (const layer of layers) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter((method) => method !== '_all')
      const handlers = layer.route.stack.map((entry) => entry.handle)
      const own = collectMeta(handlers)
      // `router.get(['/a', '/b'], handler)` is a single layer holding two
      // paths, and the array must not be stringified into `/a,/b` — a path
      // no client can call, and one an OpenAPI validator accepts without
      // complaint because it is a legal (if useless) template.
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]
      for (const method of methods) {
        for (const routePath of paths) {
          out.push({
            method: method.toUpperCase(),
            path: joinPath(prefix, routePath),
            security: [...new Set([...pending.security, ...own.security])],
            permissions: [...new Set([...pending.permissions, ...own.permissions])],
            permissionMode: own.permissions.length ? own.permissionMode : pending.permissionMode,
            roles: [...new Set([...pending.roles, ...own.roles])],
            body: own.body ?? null,
            query: own.query ?? null,
            params: own.params ?? null,
            response: own.response ?? null,
            idempotency: own.idempotency ?? null,
          })
        }
      }
      continue
    }

    const nested = layer.handle?.stack
    if (nested) {
      walk(nested, joinPath(prefix, prefixOf(layer)), pending, out)
      continue
    }

    // A bare `router.use(fn)`: applies to everything declared after it in
    // this file, which is why it accumulates into `pending` rather than
    // being attached to one route.
    const tag = layer.handle?.openapi
    if (!tag) continue
    if (tag.kind === 'security' && !pending.security.includes(tag.scheme)) {
      pending.security = [...pending.security, tag.scheme]
    }
    if (tag.kind === 'permission') {
      pending.permissions = [...pending.permissions, ...tag.permissions]
      if (tag.mode === 'any') pending.permissionMode = 'any'
    }
    if (tag.kind === 'role') pending.roles = [...pending.roles, ...tag.roles]
  }
}

/** @returns every route of the app, in declaration order. */
export function inventory(app) {
  const out = []
  const stack = app?._router?.stack ?? app?.router?.stack ?? []
  walk(stack, '', { security: [], permissions: [], permissionMode: 'all', roles: [] }, out)
  return out
}
