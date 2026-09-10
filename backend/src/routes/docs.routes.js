import { Router } from 'express'
import { openApiDocument } from '../services/docs/openapi.service.js'
import { DOCS_HTML, DOCS_SCRIPT } from '../services/docs/docsPage.js'
import { env } from '../config/env.js'

/**
 * `/openapi.json` and `/api/docs` (11.3).
 *
 * **Unauthenticated, deliberately.** The endpoint list is not a secret: the
 * SPA calls these routes from a JavaScript bundle anybody can read, so a
 * login wall here hides the surface from the integrator who needs it and
 * from nobody else. What the document must not contain is data — and it
 * does not: schemas, permission names and status codes only.
 *
 * Mounted with the app rather than under `/api/v1`, because the document
 * describes *every* version, `/api/public/v1` included. A spec that lived
 * inside one version's prefix would have to be duplicated the day a v2
 * appears — which is the moment a spec is most needed.
 */
export const docsRouter = Router()

/**
 * These three answer with the document and the page themselves, not with
 * the `{ success, data }` envelope — tagged so the generated document says
 * so rather than promising a wrapper that never arrives.
 */
function raw(contentType, description, handler) {
  handler.openapi = { kind: 'response', contentType, description }
  return handler
}

docsRouter.get(
  '/openapi.json',
  raw('application/json', 'The OpenAPI 3.1 document for this deployment', (req, res) => {
  // `req.app` rather than a module-level import of the app: importing it
  // here would be a cycle (app mounts this router), and the app instance
  // Express hands over is the one actually serving the request — which is
  // the point, since the document is generated from its routers.
  const document = openApiDocument(req.app, { version: process.env.npm_package_version ?? '1.0.0', apiUrl: env.API_PUBLIC_URL })
  // Long-cacheable but revalidated: the document only changes with a
  // deploy, and a deploy is exactly when a stale copy would mislead.
  res.set('Cache-Control', 'no-cache')
  res.json(document)
  })
)

docsRouter.get(
  '/api/docs',
  raw('text/html', 'The human-readable API reference', (req, res) => {
    res.type('html').send(DOCS_HTML)
  })
)

// A separate file rather than an inline <script>: helmet's default CSP is
// `script-src 'self'`, and an inline block is refused **silently** — the
// page renders empty with nothing in any log (9.3 lost an afternoon to the
// same class of bug with SCORM's frame-ancestors).
docsRouter.get(
  '/api/docs/app.js',
  raw('application/javascript', "The reference page's own script", (req, res) => {
    res.type('application/javascript').send(DOCS_SCRIPT)
  })
)
