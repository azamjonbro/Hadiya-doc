import winston from 'winston'
import { env } from './env.js'
import { createErrorTracker } from './errorTracking.js'

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'captchatoken',
])

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact)
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(val)
    }
    return out
  }
  return value
}

const PRESERVED_KEYS = new Set(['level', 'message', 'timestamp'])

// Mutates `info` in place (rather than returning a new object) so winston's
// internal Symbol('level')/Symbol('message') properties survive — later
// formats like colorize() read those symbols, not just the plain keys.
const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (PRESERVED_KEYS.has(key)) continue
    info[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(info[key])
  }
  return info
})

// Forwards error-level entries to Sentry/GlitchTip.
//
// A transport rather than explicit reportError() calls at each throw site:
// every `logger.error(...)` in the codebase is already the point where we
// decided something went wrong, and there are dozens of them. Wiring the
// reporter anywhere else would mean remembering to call it, which is the
// failure mode a tracker exists to remove.
//
// It sits after redactFormat() in the pipeline, so an event can only carry
// fields the console log would also have shown — the tracker never becomes
// the one place a token leaks off the box.
class ErrorTrackingTransport extends winston.Transport {
  constructor(tracker, options = {}) {
    super({ ...options, level: 'error' })
    this.tracker = tracker
  }

  log(info, next) {
    const { level, message, timestamp, ...meta } = info
    // Fire and forget: a request must never wait on the tracker, and a
    // tracker that is down must never turn one error into two. The catch
    // deliberately goes to the console directly rather than logger.error,
    // which would recurse straight back into this transport.
    this.tracker.send({ message, meta }).catch((error) => {
      console.error(`[error-tracking] could not report event: ${error.message}`)
    })
    next()
  }
}

const errorTracker = createErrorTracker({
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
  release: env.SENTRY_RELEASE,
  onDropped: (count) => {
    console.warn(`[error-tracking] rate limit: ${count} event(s) dropped in the last minute`)
  },
})

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    redactFormat(),
    env.isProduction
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  transports: [
    new winston.transports.Console(),
    ...(errorTracker ? [new ErrorTrackingTransport(errorTracker)] : []),
  ],
})

if (errorTracker) {
  logger.info('Error tracking enabled', { endpoint: errorTracker.endpoint })
}
