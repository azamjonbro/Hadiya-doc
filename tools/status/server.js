import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import path from 'node:path'
import { collect, ROOT } from './collect.js'

/**
 * A live view of where the work stands.
 *
 * Runs on the machine that has the repository, because that is the only
 * place the answer exists: the checklist file and the git history. A hosted
 * page could not read either.
 *
 * Updates are pushed over server-sent events rather than polled from the
 * browser. Polling would either be slow enough to feel stale or frequent
 * enough to run `git log` every second for a page nobody is looking at.
 */

const PORT = Number(process.env.STATUS_PORT ?? 4777)

// Coalesced: a single `git commit` touches several files under .git and
// would otherwise fire a burst of identical rebuilds.
let pending = null
const clients = new Set()

async function broadcast() {
  if (!clients.size) return
  const payload = JSON.stringify(await collect())
  for (const client of clients) {
    client.write(`data: ${payload}\n\n`)
  }
}

function scheduleBroadcast() {
  clearTimeout(pending)
  pending = setTimeout(() => {
    broadcast().catch(() => {
      /* a failed refresh is not worth killing the server for; the next
         change or the client's own reconnect will retry */
    })
  }, 400)
}

/**
 * What is worth watching, and what is not.
 *
 * Watching `.git` wholesale looked obvious and was a feedback loop:
 * `collect()` runs `git status`, which refreshes `.git/index`, which fires
 * the watcher, which collects again — eighteen rebuilds in eight idle
 * seconds, measured.
 *
 * Refs are the safe signal. A commit moves `refs/heads/<branch>` and
 * `HEAD`, and nothing this server does writes either. The checklist is
 * watched directly because it is what changes when an item is finished.
 *
 * A slow poll sits behind both, for the cases fs.watch does not see —
 * another worktree, a network volume, an editor that replaces the file
 * rather than writing it.
 */
const POLL_MS = 15000

function watchPaths() {
  const targets = [
    path.join(ROOT, 'docs/v3/09-master-checklist.md'),
    path.join(ROOT, '.git/HEAD'),
    path.join(ROOT, '.git/refs/heads'),
    path.join(ROOT, 'tools/status/last-test-run.json'),
  ]
  for (const target of targets) {
    try {
      watch(target, { persistent: true }, scheduleBroadcast)
    } catch {
      // A path that does not exist yet (the test-result file before the
      // first run) simply is not watched — the poll below still covers it.
    }
  }

  setInterval(() => {
    if (clients.size) scheduleBroadcast()
  }, POLL_MS).unref()
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(`data: ${JSON.stringify(await collect())}\n\n`)
    clients.add(res)
    // A comment line every 25 seconds: proxies and laptops asleep on the
    // sofa both drop an idle stream, and the browser only reconnects once
    // it notices.
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000)
    req.on('close', () => {
      clearInterval(keepAlive)
      clients.delete(res)
    })
    return
  }

  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(await collect(), null, 2))
    return
  }

  try {
    const html = await readFile(path.join(ROOT, 'tools/status/index.html'), 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`Could not read the page: ${error.message}`)
  }
})

// Localhost only. This exposes the repository's history and file names, and
// binding it to every interface would put that on whatever network the
// laptop is on.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Qo'llanma status: http://localhost:${PORT}`)
  watchPaths()
})
