// The envelope format is the whole risk here.
//
// A tracker that posts a slightly wrong body does not fail — the ingest
// endpoint answers 200 and drops the event, and the first time anyone finds
// out is when they go looking for an incident that was never recorded. So
// the shape is asserted here rather than trusted, along with the two things
// that must hold in production: it never throws into the caller, and it
// never becomes the place a secret leaves the box.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEnvelope,
  buildEvent,
  createErrorTracker,
  parseDsn,
  parseStack,
} from '../src/config/errorTracking.js'

const DSN = 'https://abc123def456@glitchtip.example.uz/7'

describe('parseDsn', () => {
  test('splits a DSN into key, project and ingest endpoint', () => {
    assert.deepEqual(parseDsn(DSN), {
      publicKey: 'abc123def456',
      projectId: '7',
      endpoint: 'https://glitchtip.example.uz/api/7/envelope/',
    })
  })

  test('keeps a non-default port', () => {
    assert.equal(
      parseDsn('http://key@localhost:8000/2').endpoint,
      'http://localhost:8000/api/2/envelope/'
    )
  })

  test('a DSN pasted without its key is a boot failure, not a silent no-op', () => {
    assert.throws(() => parseDsn('https://glitchtip.example.uz/7'), /publicKey/)
    assert.throws(() => parseDsn('https://key@glitchtip.example.uz'), /publicKey/)
    assert.throws(() => parseDsn('not-a-url'), /not a URL/)
  })
})

describe('parseStack', () => {
  const stack = [
    'Error: boom',
    '    at readCourse (file:///srv/app/backend/src/services/course.service.js:31:9)',
    '    at /srv/app/backend/node_modules/express/lib/router/route.js:149:13',
    '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
  ].join('\n')

  test('reads function, file, line and column', () => {
    const frames = parseStack(stack)
    const innermost = frames.at(-1)
    assert.equal(innermost.function, 'readCourse')
    assert.equal(innermost.filename, '/srv/app/backend/src/services/course.service.js')
    assert.equal(innermost.lineno, 31)
    assert.equal(innermost.colno, 9)
  })

  test('orders frames innermost-last, the way Sentry renders them', () => {
    const frames = parseStack(stack)
    assert.equal(frames.length, 3)
    assert.match(frames[0].filename, /task_queues/)
    assert.match(frames.at(-1).filename, /course\.service\.js/)
  })

  test('marks dependency frames out-of-app so our own code is highlighted', () => {
    const frames = parseStack(stack)
    assert.equal(frames.find((f) => f.filename.includes('express')).in_app, false)
    assert.equal(frames.find((f) => f.filename.includes('course.service')).in_app, true)
  })

  test('a frame with no function name still parses', () => {
    const [frame] = parseStack('Error: x\n    at /srv/app/a.js:1:2')
    assert.equal(frame.function, '<anonymous>')
    assert.equal(frame.lineno, 1)
  })

  test('a missing or malformed stack is not an error', () => {
    assert.deepEqual(parseStack(undefined), [])
    assert.deepEqual(parseStack('Error: no frames at all'), [])
  })
})

describe('buildEvent', () => {
  const base = {
    message: 'Video transcode failed',
    environment: 'production',
    release: 'e72bc75',
    eventId: '0'.repeat(32),
    now: new Date('2026-09-08T10:00:00Z'),
  }

  test('groups by the stable error code rather than the message text', () => {
    const event = buildEvent({ ...base, meta: { code: 'VIDEO_TRANSCODE_FAILED' } })
    assert.equal(event.exception.values[0].type, 'VIDEO_TRANSCODE_FAILED')
    assert.equal(event.exception.values[0].value, 'Video transcode failed')
  })

  test('falls back to Error when there is no code', () => {
    assert.equal(buildEvent({ ...base, meta: {} }).exception.values[0].type, 'Error')
  })

  test('carries the request path as the transaction', () => {
    const event = buildEvent({ ...base, meta: { path: '/api/v1/courses/42' } })
    assert.equal(event.transaction, '/api/v1/courses/42')
  })

  test('remaining log fields become extra, without stack/code/path duplicated', () => {
    const event = buildEvent({
      ...base,
      meta: { code: 'X', path: '/p', stack: 'Error: x\n    at /a.js:1:2', videoId: 'v1' },
    })
    assert.deepEqual(event.extra, { videoId: 'v1' })
    assert.ok(event.exception.values[0].stacktrace.frames.length > 0)
  })

  test('omits extra entirely when there is nothing left to send', () => {
    assert.equal('extra' in buildEvent({ ...base, meta: { code: 'X' } }), false)
  })

  test('release is omitted rather than sent empty', () => {
    assert.equal('release' in buildEvent({ ...base, release: '', meta: {} }), false)
  })

  test('the required envelope fields are present', () => {
    const event = buildEvent({ ...base, meta: {} })
    assert.equal(event.event_id.length, 32)
    assert.equal(event.platform, 'node')
    assert.equal(event.level, 'error')
    assert.equal(event.environment, 'production')
    assert.equal(event.timestamp, '2026-09-08T10:00:00.000Z')
    assert.ok(event.server_name)
  })
})

describe('buildEnvelope', () => {
  test('is three newline-separated JSON lines: header, item header, event', () => {
    const event = buildEvent({
      message: 'x',
      meta: {},
      environment: 'test',
      eventId: 'a'.repeat(32),
      now: new Date('2026-09-08T10:00:00Z'),
    })
    const lines = buildEnvelope(event, { sentAt: new Date('2026-09-08T10:00:01Z') }).split('\n')
    assert.equal(lines.length, 3)
    assert.deepEqual(JSON.parse(lines[0]), {
      event_id: 'a'.repeat(32),
      sent_at: '2026-09-08T10:00:01.000Z',
    })
    assert.deepEqual(JSON.parse(lines[1]), { type: 'event' })
    assert.equal(JSON.parse(lines[2]).event_id, 'a'.repeat(32))
  })
})

describe('createErrorTracker', () => {
  const collect = () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url, init })
      return { ok: true, status: 200 }
    }
    return { calls, fetchImpl }
  }

  test('no DSN means no tracker at all — not a tracker that posts nowhere', () => {
    assert.equal(createErrorTracker({ dsn: '' }), null)
    assert.equal(createErrorTracker({}), null)
  })

  test('posts the envelope with the auth header the ingest API expects', async () => {
    const { calls, fetchImpl } = collect()
    const tracker = createErrorTracker({ dsn: DSN, environment: 'production', fetchImpl })
    await tracker.send({ message: 'boom', meta: { code: 'INTERNAL_ERROR' } })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://glitchtip.example.uz/api/7/envelope/')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.headers['Content-Type'], 'application/x-sentry-envelope')
    assert.match(calls[0].init.headers['X-Sentry-Auth'], /sentry_version=7/)
    assert.match(calls[0].init.headers['X-Sentry-Auth'], /sentry_key=abc123def456/)

    const event = JSON.parse(calls[0].init.body.split('\n')[2])
    assert.equal(event.exception.values[0].type, 'INTERNAL_ERROR')
    assert.equal(event.environment, 'production')
  })

  test('gives up on a hanging endpoint instead of holding the process open', async () => {
    const { calls, fetchImpl } = collect()
    const tracker = createErrorTracker({ dsn: DSN, fetchImpl })
    await tracker.send({ message: 'x', meta: {} })
    assert.ok(calls[0].init.signal, 'no abort signal — a stalled tracker would leak requests')
  })

  test('a storm is capped, and the drop count is reported once the window rolls', async () => {
    const { calls, fetchImpl } = collect()
    const dropped = []
    const tracker = createErrorTracker({ dsn: DSN, fetchImpl, onDropped: (n) => dropped.push(n) })

    for (let i = 0; i < 45; i += 1) {
      await tracker.send({ message: `boom ${i}`, meta: {} })
    }
    assert.equal(calls.length, 30, 'the per-minute cap did not hold')
    assert.deepEqual(dropped, [], 'nothing is reported until the window rolls over')
  })

  test('send resolves false when an event was dropped, true when it was sent', async () => {
    const { fetchImpl } = collect()
    const tracker = createErrorTracker({ dsn: DSN, fetchImpl })
    assert.equal(await tracker.send({ message: 'first', meta: {} }), true)
    for (let i = 0; i < 29; i += 1) await tracker.send({ message: 'x', meta: {} })
    assert.equal(await tracker.send({ message: 'over the cap', meta: {} }), false)
  })
})
