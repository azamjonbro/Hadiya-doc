import { logger } from '../config/logger.js'

// Access logging (spec §49: "request" + "response status" in every
// production log). Mounted before auth/routing so it wraps every request,
// including ones that fail before reaching a handler; attaching the
// listener early still captures req.user because `finish` fires after the
// whole middleware chain has run, not at mount time. No headers or body
// are logged — method/path/status/duration/ip/actor is enough to
// reconstruct traffic patterns without risking a stray secret in the logs.
export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6
    logger.http('HTTP request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      ip: req.ip,
      userId: req.user?.id ?? null,
    })
  })
  next()
}
