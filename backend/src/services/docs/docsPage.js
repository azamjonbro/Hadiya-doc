/**
 * The human-readable API reference at `/api/docs` (11.3).
 *
 * Hand-written rather than Swagger UI, for two reasons that both come from
 * this deployment: the API's CSP is helmet's default (`script-src 'self'`),
 * so a CDN bundle simply does not execute and does so **silently** — the
 * SCORM item (9.3) lost an afternoon to exactly that; and serving
 * `swagger-ui-dist` locally means shipping a megabyte of vendor assets
 * through the same nginx that already serves the SPA, to render a document
 * whose useful content is a filterable list of 370 lines.
 *
 * So: two same-origin files, no inline script, no dependency. The page
 * fetches `/api/openapi.json` — the same document an integrator's codegen
 * reads, which also means the page cannot show something the machine
 * document does not say.
 */

export const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Qo'llanma API</title>
<!-- Inline, as a data URI: the API serves no static files, so without this
     the browser's automatic /favicon.ico request is a 404 in the log of
     every page view. -->
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%231f6feb'/%3E%3Ctext x='8' y='12' font-family='monospace' font-size='11' fill='white' text-anchor='middle'%3EQ%3C/text%3E%3C/svg%3E" />
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #14181f; --muted: #5c6572; --line: #e3e6eb;
    --card: #f7f8fa; --accent: #1f6feb; --get: #1a7f37; --post: #9a6700;
    --patch: #8250df; --delete: #cf222e; --code: #eef1f5;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #262c36;
      --card: #151b23; --accent: #4493f8; --get: #3fb950; --post: #d29922;
      --patch: #ab7df8; --delete: #f85149; --code: #1c2129;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0 16px 48px; background: var(--bg); color: var(--fg);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  header { max-width: 980px; margin: 0 auto; padding: 28px 0 16px; border-bottom: 1px solid var(--line); }
  h1 { margin: 0 0 6px; font-size: 22px; }
  p.lead { margin: 0; color: var(--muted); max-width: 70ch; }
  main { max-width: 980px; margin: 0 auto; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 16px 0; }
  input[type="search"] { flex: 1 1 240px; min-width: 0; padding: 8px 10px; border: 1px solid var(--line);
    border-radius: 8px; background: var(--card); color: var(--fg); font: inherit; }
  .count { color: var(--muted); font-size: 13px; }
  h2 { margin: 24px 0 8px; font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .op { border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px; background: var(--card); }
  .op > summary { cursor: pointer; padding: 8px 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
  .op > summary::marker { color: var(--muted); }
  .m { font-weight: 700; font-size: 12px; letter-spacing: .04em; }
  .m.GET { color: var(--get); } .m.POST { color: var(--post); }
  .m.PATCH, .m.PUT { color: var(--patch); } .m.DELETE { color: var(--delete); }
  .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; word-break: break-all; }
  .gate { color: var(--muted); font-size: 12px; flex: 1 1 100%; }
  .body { padding: 0 10px 12px; }
  .body h3 { margin: 12px 0 4px; font-size: 12px; text-transform: uppercase; color: var(--muted); }
  pre { margin: 0; padding: 10px; background: var(--code); border-radius: 6px; overflow-x: auto; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code);
    padding: 1px 4px; border-radius: 4px; }
  a { color: var(--accent); }
  .empty { color: var(--muted); padding: 24px 0; }
</style>
</head>
<body>
<header>
  <h1>Qo'llanma API</h1>
  <p class="lead">
    Generated from the running routers, so it describes what this deployment actually serves.
    The machine-readable document is at <a href="/api/openapi.json">/api/openapi.json</a>.
  </p>
</header>
<main>
  <div class="controls">
    <input type="search" id="q" placeholder="Filter by path, method, permission…" autocomplete="off" />
    <span class="count" id="count"></span>
  </div>
  <div id="out"><p class="empty">Loading…</p></div>
</main>
<script src="/api/docs/app.js"></script>
</body>
</html>
`

export const DOCS_SCRIPT = `(function () {
  var doc = null

  function esc(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  // The document $refs its two envelope schemas, so anything shown inline
  // has to resolve them or the reader sees a pointer instead of a shape.
  function resolve(node) {
    if (!node || typeof node !== 'object') return node
    if (node.$ref) {
      var name = node.$ref.split('/').pop()
      return resolve(doc.components.schemas[name])
    }
    return node
  }

  function operations() {
    var out = []
    Object.keys(doc.paths).forEach(function (path) {
      Object.keys(doc.paths[path]).forEach(function (method) {
        out.push({ method: method.toUpperCase(), path: path, op: doc.paths[path][method] })
      })
    })
    return out
  }

  function paramTable(params, where) {
    var rows = (params || []).filter(function (p) { return p.in === where })
    if (!rows.length) return ''
    return (
      '<h3>' + where + '</h3><table><tr><th>Name</th><th>Type</th><th>Required</th></tr>' +
      rows
        .map(function (p) {
          var schema = p.schema || {}
          var type = schema.type || (schema.anyOf ? 'any of' : '—')
          if (schema.enum) type = schema.enum.map(function (v) { return '"' + v + '"' }).join(' | ')
          return (
            '<tr><td><code>' + esc(p.name) + '</code></td><td>' + esc(type) + '</td><td>' +
            (p.required ? 'yes' : 'no') + '</td></tr>'
          )
        })
        .join('') +
      '</table>'
    )
  }

  function bodyBlock(op) {
    var content = op.requestBody && op.requestBody.content && op.requestBody.content['application/json']
    if (!content) return ''
    return '<h3>request body</h3><pre>' + esc(JSON.stringify(resolve(content.schema), null, 1)) + '</pre>'
  }

  function render(filter) {
    var query = filter.trim().toLowerCase()
    var groups = {}
    var shown = 0

    operations().forEach(function (entry) {
      var haystack = (
        entry.method + ' ' + entry.path + ' ' + (entry.op.description || '')
      ).toLowerCase()
      if (query && haystack.indexOf(query) === -1) return
      var tag = (entry.op.tags && entry.op.tags[0]) || 'other'
      ;(groups[tag] = groups[tag] || []).push(entry)
      shown += 1
    })

    var out = document.getElementById('out')
    document.getElementById('count').textContent =
      shown + ' of ' + operations().length + ' endpoints'

    if (!shown) {
      out.innerHTML = '<p class="empty">Nothing matches that.</p>'
      return
    }

    out.innerHTML = Object.keys(groups)
      .sort()
      .map(function (tag) {
        return (
          '<h2>' + esc(tag) + '</h2>' +
          groups[tag]
            .map(function (entry) {
              return (
                '<details class="op"><summary>' +
                '<span class="m ' + entry.method + '">' + entry.method + '</span>' +
                '<span class="path">' + esc(entry.path) + '</span>' +
                '<span class="gate">' + esc(entry.op.description || '') + '</span>' +
                '</summary><div class="body">' +
                paramTable(entry.op.parameters, 'path') +
                paramTable(entry.op.parameters, 'query') +
                bodyBlock(entry.op) +
                '<h3>responses</h3><table><tr><th>Code</th><th>Meaning</th></tr>' +
                Object.keys(entry.op.responses)
                  .map(function (code) {
                    return (
                      '<tr><td><code>' + code + '</code></td><td>' +
                      esc(entry.op.responses[code].description) + '</td></tr>'
                    )
                  })
                  .join('') +
                '</table></div></details>'
              )
            })
            .join('')
        )
      })
      .join('')
  }

  fetch('/api/openapi.json')
    .then(function (response) { return response.json() })
    .then(function (json) {
      doc = json
      document.title = doc.info.title + ' ' + doc.info.version
      var input = document.getElementById('q')
      input.addEventListener('input', function () { render(input.value) })
      render('')
    })
    .catch(function () {
      document.getElementById('out').innerHTML =
        '<p class="empty">Could not load /api/openapi.json.</p>'
    })
})()
`
