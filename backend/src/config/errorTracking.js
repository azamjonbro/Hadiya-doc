/**
 * Ships `logger.error(...)` entries to Sentry or GlitchTip.
 *
 * Written against the ingest API directly rather than pulling in
 * @sentry/node. The SDK's value is its auto-instrumentation — it wraps http,
 * express and the async context to attach traces and breadcrumbs — and that
 * is precisely what we do not want on a box that also runs six unrelated
 * sites: it patches globals, and its OpenTelemetry layer is a large moving
 * dependency for a feature whose whole job is "post a JSON envelope when
 * something throws". The envelope format below is the stable, documented
 * one, GlitchTip implements the same endpoint, and it is covered by
 * test/errorTracking.test.js so a format mistake fails loudly here instead
 * of silently dropping every event in production.
 *
 * Disabled unless SENTRY_DSN is set — no DSN, no network calls, no cost.
 */
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

// A burst of identical errors (a dead database, a failing job retrying)
// must not turn into thousands of outbound requests. Past the cap the
// events are counted and dropped; the count is reported with the first
// event of the next window so the gap is visible rather than silent.
const WINDOW_MS = 60_000
const MAX_EVENTS_PER_WINDOW = 30
const SEND_TIMEOUT_MS = 4000

const FRAME_RE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/

/**
 * Splits `https://<key>@<host>/<projectId>` into the pieces the ingest
 * endpoint needs. Throws on a malformed DSN so a typo is a boot failure,
 * not a tracker that quietly reports nothing.
 */
export function parseDsn(dsn) {
  let url
  try {
    url = new URL(dsn)
  } catch {
    throw new Error(`SENTRY_DSN is not a URL: ${dsn}`)
  }
  const projectId = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!url.username || !projectId) {
    throw new Error(
      'SENTRY_DSN must look like https://<publicKey>@<host>/<projectId> ' +
        '(copy it from the project settings, including the key before the @)'
    )
  }
  return {
    publicKey: url.username,
    projectId,
    endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
  }
}

/**
 * Node stack lines into Sentry frames, innermost last — Sentry renders the
 * array bottom-up, which is the opposite of how Node prints it.
 */
export function parseStack(stack) {
  if (typeof stack !== 'string') return []
  const frames = []
  for (const line of stack.split('\n').slice(1)) {
    const match = FRAME_RE.exec(line)
    if (!match) continue
    const [, fn, file, lineNo, colNo] = match
    frames.push({
      function: fn ?? '<anonymous>',
      filename: file.replace(/^file:\/\//, ''),
      lineno: Number(lineNo),
      colno: Number(colNo),
      in_app: !file.includes('node_modules'),
    })
  }
  return frames.reverse()
}

/**
 * Builds the event body. `meta` is a winston log entry's extra fields,
 * already run through the logger's redaction format — this must never be
 * the place that first sees a raw password or token.
 */
export function buildEvent({ message, meta = {}, environment, release, eventId = randomUUID().replace(/-/g, ''), now = new Date() }) {
  const { stack, code, path, ...extra } = meta
  const frames = parseStack(stack)

  return {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: 'node',
    level: 'error',
    logger: 'winston',
    environment,
    ...(release ? { release } : {}),
    server_name: hostname(),
    // `type` is what Sentry groups by, so the stable code (INTERNAL_ERROR,
    // VIDEO_TRANSCODE_FAILED) is a far better title than the first line of
    // a message that may embed an id.
    exception: {
      values: [
        {
          type: code ?? 'Error',
          value: String(message ?? ''),
          ...(frames.length ? { stacktrace: { frames } } : {}),
        },
      ],
    },
    ...(path ? { transaction: String(path) } : {}),
    ...(Object.keys(extra).length ? { extra } : {}),
  }
}

export function buildEnvelope(event, { sentAt = new Date() } = {}) {
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: sentAt.toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n')
}

export function createErrorTracker({ dsn, environment, release, fetchImpl = fetch, onDropped } = {}) {
  if (!dsn) return null
  const { publicKey, endpoint } = parseDsn(dsn)

  let windowStart = Date.now()
  let sentInWindow = 0
  let droppedInWindow = 0

  async function send(entry) {
    const now = Date.now()
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now
      sentInWindow = 0
      if (droppedInWindow) {
        onDropped?.(droppedInWindow)
        droppedInWindow = 0
      }
    }
    if (sentInWindow >= MAX_EVENTS_PER_WINDOW) {
      droppedInWindow += 1
      return false
    }
    sentInWindow += 1

    const event = buildEvent({ ...entry, environment, release })
    await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=qollanma/1, sentry_key=${publicKey}`,
      },
      body: buildEnvelope(event),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    return true
  }

  return { endpoint, send }
}
