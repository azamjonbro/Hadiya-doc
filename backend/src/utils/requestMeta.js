export function requestMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] ?? '' }
}
