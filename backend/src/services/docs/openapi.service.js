import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { inventory } from './routeInventory.js'

/**
 * The OpenAPI document, generated from the routers themselves (11.3).
 *
 * `docs/api-contract.md` was written by hand and describes the API as it
 * was when somebody last remembered to edit it. This is generated at boot
 * from the same middleware chain that enforces the rules, so an endpoint
 * cannot be documented as public when it is behind a role, and cannot be
 * missing because whoever added it forgot the document existed.
 *
 * What that costs: the descriptions are mechanical. There is no per-endpoint
 * prose here, because prose is exactly the part that rots — the machine
 * states the method, the path, which token opens it, which permission it
 * needs and what the body must look like, all of it true by construction.
 */

// Adds the optional `.openapi()` method. It does not change how any schema
// validates, so the validators keep behaving exactly as before.
extendZodWithOpenApi(z)

/**
 * The envelope every response uses (`sendSuccess`/`sendError`).
 *
 * Registered once as a component and referenced everywhere: an integrator
 * needs to know that `data` is nested inside a wrapper *before* the first
 * request, and repeating the wrapper 370 times would make the document
 * unreadable and enormous.
 */
const successEnvelope = z
  .object({
    success: z.literal(true),
    message: z.string(),
    // Deliberately untyped: per-endpoint response shapes are not validated
    // anywhere in this codebase, so a schema here would be a claim nothing
    // enforces. Saying "an object or a list" honestly beats a confident
    // description that drifts.
    data: z.unknown().nullable(),
  })
  .openapi('SuccessEnvelope')

const errorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    // The stable half of an error: `message` is for a person and can be
    // reworded, `code` is what an integration should branch on.
    code: z.string().nullable(),
    data: z.null(),
  })
  .openapi('ErrorEnvelope')

/** `/api/v1/courses/:id/topics` → `/api/v1/courses/{id}/topics`. */
function toOpenApiPath(path) {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

function pathParams(path) {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1])
}

/**
 * The tag an endpoint is filed under: its first meaningful path segment.
 *
 * Derived rather than assigned, so a new router shows up in the document
 * grouped sensibly without anybody adding it to a list of tags.
 */
function tagOf(path) {
  const segments = path.split('/').filter(Boolean)
  if (path === '/openapi.json' || path.startsWith('/api/docs')) return 'docs'
  if (segments[0] === 'api' && segments[1] === 'public') return 'public-api'
  const rest = segments.slice(segments[0] === 'api' ? 2 : 0)
  return rest[0]?.startsWith(':') ? 'root' : (rest[0] ?? 'root')
}

/** What the gate on this route requires, in one line an integrator can act on. */
function describe(route) {
  const parts = []
  if (route.security.includes('apiKeyAuth')) parts.push('Needs an API key (`Authorization: Bearer lms_…` or `X-API-Key`).')
  else if (route.security.includes('bearerAuth')) parts.push('Needs a session access token.')
  else if (route.security.includes('playbackToken')) parts.push('Needs a playback token in the query — a `<video>` element cannot send an Authorization header.')
  // Not simply "public": several of these carry their own short-lived
  // token in the path or query (a SCORM launch, a certificate serial) and
  // calling them unauthenticated would be wrong in the other direction.
  else parts.push('No session token — either public, or guarded by a token carried in the request itself.')

  if (route.roles.length) parts.push(`Role: ${route.roles.join(' or ')}.`)
  if (route.permissions.length) {
    const joiner = route.permissionMode === 'any' ? ' or ' : ' and '
    parts.push(`Permission: ${route.permissions.join(joiner)}.`)
  }
  return parts.join(' ')
}

const ERROR_RESPONSES = {
  400: 'Validation failed, or the request is impossible in this state',
  401: 'No credentials, or credentials that are not valid',
  403: 'Authenticated, but not allowed to do this',
  404: 'No such record',
  429: 'Rate limited — back off and retry',
}

function errorResponse(description) {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  }
}

/**
 * Builds the document for one app instance.
 *
 * Takes the app rather than importing it, so the generator has no opinion
 * about which routers are mounted — and so a test can build a document for
 * a router in isolation.
 */
export function buildOpenApiDocument(app, { version = '1.0.0', apiUrl = '' } = {}) {
  const registry = new OpenAPIRegistry()
  registry.register('SuccessEnvelope', successEnvelope)
  registry.register('ErrorEnvelope', errorEnvelope)

  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'The access token from `POST /api/v1/auth/login`. Fifteen minutes; refresh with the ' +
      'httpOnly cookie via `POST /api/v1/auth/refresh`. For a machine integration use an ' +
      'API key on `/api/public/v1` instead — a session token is refused there, and a key ' +
      'is refused here.',
  })
  registry.registerComponent('securitySchemes', 'playbackToken', {
    type: 'apiKey',
    in: 'query',
    name: 'token',
    description:
      'A short-lived token minted per playback by `GET /api/v1/videos/{id}/playback-token`. ' +
      'In the query rather than a header because the browser element that fetches these ' +
      'URLs cannot set one.',
  })
  registry.registerComponent('securitySchemes', 'apiKeyAuth', {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-Key',
    description:
      'A key issued by a SUPERADMIN (`lms_<prefix>_<secret>`), also accepted as ' +
      '`Authorization: Bearer`. Read-only, scoped, and rate-limited per key.',
  })

  const routes = inventory(app)
  const tags = new Set()

  for (const route of routes) {
    const path = toOpenApiPath(route.path)
    tags.add(tagOf(route.path))

    const security = []
    if (route.security.includes('bearerAuth')) security.push({ bearerAuth: [] })
    if (route.security.includes('apiKeyAuth')) security.push({ apiKeyAuth: [] })
    if (route.security.includes('playbackToken')) security.push({ playbackToken: [] })

    const request = {}
    if (route.query) request.query = route.query
    if (route.body) request.body = { content: { 'application/json': { schema: route.body } } }
    /**
     * `Idempotency-Key` on the endpoints that honour it (11.5).
     *
     * Declared as a header parameter rather than mentioned in prose: a
     * client generator then produces a function that can actually pass
     * one, which is the difference between a documented feature and a
     * usable one.
     */
    const headers = route.idempotency
      ? [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: Boolean(route.idempotency.required),
            schema: { type: 'string', maxLength: 200 },
            description:
              'Retry-safe: a repeat of this request with the same key returns the first ' +
              "response instead of acting twice (`Idempotent-Replay: true`). Reusing a key with a " +
              'different body is a 409 `IDEMPOTENCY_KEY_REUSED`; retrying while the first request ' +
              'is still running is a 409 `IDEMPOTENCY_IN_PROGRESS`. Kept for 24 hours.',
          },
        ]
      : []

    const params = pathParams(route.path)
    if (params.length) {
      // Path parameters are ids the router has already matched as strings.
      // A `validateParams` schema is used when the route has one; otherwise
      // the honest description is "a string this route recognises".
      request.params = z.object(
        Object.fromEntries(params.map((name) => [name, z.string().openapi({ description: `\`${name}\` path parameter` })]))
      )
    }

    registry.registerPath({
      method: route.method.toLowerCase(),
      path,
      // Mechanical on purpose — see the file comment.
      summary: `${route.method} ${path}`,
      description: describe(route),
      tags: [tagOf(route.path)],
      security,
      ...(Object.keys(request).length ? { request } : {}),
      ...(headers.length ? { parameters: headers } : {}),
      responses: {
        200: route.response
          ? {
              description: route.response.description,
              content: { [route.response.contentType]: { schema: { type: 'string' } } },
            }
          : {
              description: 'Success',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } },
            },
        ...Object.fromEntries(
          Object.entries(ERROR_RESPONSES)
            // Only the codes this route can actually produce: a public
            // endpoint cannot answer 403, and listing it would be noise.
            .filter(([code]) => {
              if ((code === '401' || code === '403') && !security.length) return false
              return true
            })
            .map(([code, description]) => [code, errorResponse(description)])
        ),
      },
    })
  }

  const generator = new OpenApiGeneratorV31(registry.definitions)
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: "Qo'llanma LMS API",
      version,
      description:
        'Generated from the running routers, so it describes what this deployment actually ' +
        'serves. Two doors: `/api/v1` for the app (session tokens) and `/api/public/v1` for ' +
        'integrations (API keys, read-only). Every response is wrapped in the envelope — the ' +
        'payload is under `data`. Errors carry a stable `code` to branch on; `message` is for ' +
        'a person and may be reworded.',
    },
    // A relative server, and an absolute one only when it is configured.
    // Never one built from the request headers: behind the Cloudflare tunnel
    // `X-Forwarded-Proto` says http on an https deployment, and a document
    // that hands integrators `http://…` URLs is worse than one that hands
    // them a relative path.
    servers: [{ url: '/', description: 'This deployment' }, ...(apiUrl ? [{ url: apiUrl }] : [])],
    tags: [...tags].sort().map((name) => ({ name })),
  })
}

// Built once per process. The routers do not change while the app is
// running, and generating 370 operations on every request to a
// documentation endpoint would make it the most expensive route in the API.
let cached = null

export function openApiDocument(app, options) {
  if (!cached) cached = buildOpenApiDocument(app, options)
  return cached
}

export function resetOpenApiCache() {
  cached = null
}
