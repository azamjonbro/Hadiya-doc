// 11.3 — the generated OpenAPI document.
//
// The tests are about the one property that makes a generated document
// worth having: it cannot disagree with the app. So they check the
// document against the *router stack* rather than against a fixture —
// a fixture would have to be updated by hand, which is the failure this
// item exists to remove.
//
// The rest is what an integrator would trip over first: that every
// endpoint says which credential opens it, that the request shapes come
// from the validators that actually run, and that the two doors are
// described as separate.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { z } from 'zod'
import { createApp } from '../src/app.js'
import { inventory } from '../src/services/docs/routeInventory.js'
import { buildOpenApiDocument } from '../src/services/docs/openapi.service.js'
import { authenticate } from '../src/middlewares/auth.middleware.js'
import { requirePermission, requireAnyPermission, requireRole } from '../src/middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../src/middlewares/validate.middleware.js'
import { redisConnection } from '../src/config/redis.js'

let app
let doc
let routes

const operations = () =>
  Object.entries(doc.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]) => ({ path, method, operation }))
  )

describe('11.3 · the OpenAPI document', () => {
  before(() => {
    app = createApp()
    routes = inventory(app)
    doc = buildOpenApiDocument(app)
  })

  after(() => {
    // Importing the app pulls in every queue module, and each one holds a
    // Redis connection open — without this the runner passes and then sits
    // there forever waiting for the event loop to drain.
    redisConnection.disconnect()
  })

  describe('it is generated from the app, not maintained beside it', () => {
    test('every route the app serves is in the document, and nothing else is', () => {
      const fromApp = new Set(routes.map((route) => `${route.method} ${route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`))
      const fromDoc = new Set(operations().map((entry) => `${entry.method.toUpperCase()} ${entry.path}`))
      // Both directions on purpose: a document that omits endpoints is
      // useless, and one that invents them is worse than useless.
      assert.deepEqual([...fromDoc].filter((key) => !fromApp.has(key)), [])
      assert.deepEqual([...fromApp].filter((key) => !fromDoc.has(key)), [])
      // A sanity floor, so a generator that silently produced nothing
      // could not pass the two comparisons above by being empty.
      assert.ok(fromDoc.size > 300, `only ${fromDoc.size} operations`)
    })

    test('a mount with no prefix does not add a slash', () => {
      // `app.use(docsRouter)` reports its path as '/', and treating that as
      // a prefix produced `//openapi.json` — a path no client can call.
      assert.ok(doc.paths['/openapi.json'], Object.keys(doc.paths).filter((p) => p.includes('openapi')).join())
      assert.equal(Object.keys(doc.paths).some((path) => path.includes('//')), false)
    })

    test('path parameters are declared, not left inside the path string', () => {
      const withParams = operations().filter((entry) => entry.path.includes('{'))
      assert.ok(withParams.length > 50)
      for (const entry of withParams) {
        const names = [...entry.path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1])
        const declared = (entry.operation.parameters ?? [])
          .filter((parameter) => parameter.in === 'path')
          .map((parameter) => parameter.name)
        // OpenAPI requires every templated segment to be declared and
        // required; a tool that generates a client will refuse otherwise.
        assert.deepEqual(declared.sort(), names.sort(), `${entry.method} ${entry.path}`)
      }
    })
  })

  describe('what opens each endpoint', () => {
    test('the gate in the document is the gate in the chain', () => {
      for (const route of routes) {
        const path = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
        const operation = doc.paths[path][route.method.toLowerCase()]
        const schemes = (operation.security ?? []).flatMap((entry) => Object.keys(entry))
        assert.deepEqual(schemes.sort(), [...route.security].sort(), `${route.method} ${path}`)
        // The permission is stated in words, because "why do I get a 403"
        // is otherwise a support conversation.
        for (const permission of route.permissions) {
          assert.match(operation.description, new RegExp(permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        }
        for (const role of route.roles) assert.match(operation.description, new RegExp(role))
      }
    })

    test('the two doors are described separately', () => {
      const schemes = doc.components.securitySchemes
      assert.equal(schemes.bearerAuth.type, 'http')
      assert.equal(schemes.apiKeyAuth.in, 'header')
      assert.equal(schemes.apiKeyAuth.name, 'X-API-Key')

      // Every /api/public/v1 route is a key route, and no /api/v1 route is.
      for (const entry of operations()) {
        const schemeNames = (entry.operation.security ?? []).flatMap((one) => Object.keys(one))
        if (entry.path.startsWith('/api/public/v1')) {
          assert.deepEqual(schemeNames, ['apiKeyAuth'], entry.path)
        } else {
          assert.equal(schemeNames.includes('apiKeyAuth'), false, entry.path)
        }
      }
    })

    test('a route with no credential is not described as needing one', () => {
      const login = doc.paths['/api/v1/auth/login'].post
      assert.deepEqual(login.security, [])
      // And it cannot answer 401/403, so those are not listed — a document
      // that lists every status code for every endpoint says nothing.
      assert.equal(login.responses['401'], undefined)
      assert.equal(login.responses['403'], undefined)
      assert.ok(login.responses['400'])
      assert.ok(doc.paths['/api/v1/webhooks'].get.responses['403'])
    })

    test('a token carried in the query is documented as such', () => {
      // A <video> element cannot send an Authorization header, so these
      // routes take a token in the query — describing them as "public"
      // would be wrong in the other direction.
      const stream = doc.paths['/api/v1/video-stream/{videoId}/master.m3u8'].get
      assert.deepEqual(stream.security, [{ playbackToken: [] }])
      assert.equal(doc.components.securitySchemes.playbackToken.in, 'query')
    })
  })

  describe('request shapes come from the validators that run', () => {
    test('a body schema is the zod schema the route validates with', () => {
      const create = doc.paths['/api/v1/webhooks'].post.requestBody.content['application/json'].schema
      assert.deepEqual(create.required.sort(), ['events', 'name', 'url'])
      // Straight from `createWebhookSchema`: the enum is the event
      // catalogue, so the document lists the six events without anybody
      // copying them here.
      assert.deepEqual(create.properties.events.items.enum, [
        'user.created',
        'user.deactivated',
        'assignment.created',
        'course.completed',
        'course.reopened',
        'certificate.issued',
      ])
    })

    test('query parameters carry their bounds', () => {
      const users = doc.paths['/api/public/v1/users'].get.parameters
      const limit = users.find((parameter) => parameter.name === 'limit')
      assert.equal(limit.in, 'query')
      // 1..200, the same clamp the service applies — an integrator asking
      // for 5000 learns it from the document rather than from a 400.
      assert.equal(limit.schema.maximum, 200)
      assert.equal(limit.schema.minimum, 1)
    })

    test('the envelope is a component, referenced rather than repeated', () => {
      assert.ok(doc.components.schemas.SuccessEnvelope)
      assert.ok(doc.components.schemas.ErrorEnvelope)
      // Repeating the wrapper on 370 operations would make the document
      // several megabytes and unreadable.
      const ref = doc.paths['/api/v1/webhooks'].get.responses['200'].content['application/json'].schema.$ref
      assert.equal(ref, '#/components/schemas/SuccessEnvelope')
      // `code` is the half an integration branches on, so it is in the
      // error shape rather than only in prose.
      assert.ok(doc.components.schemas.ErrorEnvelope.properties.code)
    })

    test('the routes that do not answer with the envelope say so', () => {
      // The document itself, and the page — a promised wrapper that never
      // arrives is worse than no promise.
      const spec = doc.paths['/openapi.json'].get.responses['200']
      assert.equal(spec.content['application/json'].schema.$ref, undefined)
      assert.ok(doc.paths['/api/docs'].get.responses['200'].content['text/html'])
    })
  })

  describe('the inventory itself', () => {
    test('router-level middleware is inherited by the routes below it', () => {
      // The case this exists for: `webhooksRouter.use(authenticate)` and
      // `.use(requireRole(...))` guard every route in that file without
      // appearing on any of them.
      const router = express.Router()
      router.use(authenticate)
      router.use(requireRole('SUPERADMIN'))
      router.get('/thing', requirePermission('user:read'), (req, res) => res.end())
      router.post('/thing', validateBody(z.object({ a: z.string() })), (req, res) => res.end())
      const probe = express()
      probe.use('/probe', router)

      const [get, post] = inventory(probe)
      assert.equal(get.path, '/probe/thing')
      assert.deepEqual(get.security, ['bearerAuth'])
      assert.deepEqual(get.roles, ['SUPERADMIN'])
      assert.deepEqual(get.permissions, ['user:read'])
      assert.deepEqual(post.roles, ['SUPERADMIN'])
      assert.ok(post.body)
    })

    test('"any of these permissions" is not reported as "all of them"', () => {
      const router = express.Router()
      router.get('/report', authenticate, requireAnyPermission('report:view', 'report:export'), (req, res) => res.end())
      const probe = express()
      probe.use(router)
      const [route] = inventory(probe)
      assert.equal(route.permissionMode, 'any')
      const generated = buildOpenApiDocument(probe)
      // The wording matters: "and" would tell an integrator to grant a
      // permission the route does not need.
      assert.match(generated.paths['/report'].get.description, /report:view or report:export/)
    })

    test('a query schema is reported as query, not as a body', () => {
      const router = express.Router()
      router.get('/list', validateQuery(z.object({ page: z.coerce.number().optional() })), (req, res) => res.end())
      const probe = express()
      probe.use(router)
      const [route] = inventory(probe)
      assert.ok(route.query)
      assert.equal(route.body, null)
      const generated = buildOpenApiDocument(probe)
      assert.equal(generated.paths['/list'].get.parameters[0].in, 'query')
      assert.equal(generated.paths['/list'].get.requestBody, undefined)
    })
  })

  describe('the document is a legal OpenAPI 3.1 document', () => {
    test('the parts a code generator reads are present and well formed', () => {
      assert.equal(doc.openapi, '3.1.0')
      assert.ok(doc.info.title)
      assert.ok(doc.info.version)
      // A relative server, never one built from request headers: behind the
      // Cloudflare tunnel X-Forwarded-Proto says http on an https
      // deployment, and http:// URLs in the document would break every
      // client that trusted them.
      assert.deepEqual(doc.servers[0], { url: '/', description: 'This deployment' })
      for (const entry of operations()) {
        assert.ok(entry.path.startsWith('/'), entry.path)
        assert.ok(entry.operation.responses['200'], `${entry.method} ${entry.path}`)
        assert.ok(entry.operation.tags?.length, `${entry.method} ${entry.path}`)
      }
      // Every $ref resolves.
      const refs = JSON.stringify(doc).match(/"#\/components\/schemas\/[A-Za-z0-9_]+"/g) ?? []
      for (const ref of new Set(refs)) {
        const name = ref.replace(/"|#\/components\/schemas\//g, '')
        assert.ok(doc.components.schemas[name], `dangling $ref: ${name}`)
      }
    })

    test('tags are derived from the paths, so a new router is filed on its own', () => {
      const tagNames = doc.tags.map((tag) => tag.name)
      assert.ok(tagNames.includes('webhooks'))
      assert.ok(tagNames.includes('public-api'))
      assert.ok(tagNames.includes('docs'))
      // Nothing tagged with a path parameter — that would be one tag per id.
      assert.equal(tagNames.some((name) => name.includes(':') || name.includes('{')), false)
    })
  })
})
