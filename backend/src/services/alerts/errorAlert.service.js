import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { getTransport, isMailConfigured } from '../notifications/mail.service.js'

/**
 * "Tell me when something breaks, and where" — every error the API
 * answers with, every crash the browser reports, every job that gives up,
 * mailed to ERROR_ALERT_EMAIL (the superadmin's address by default) with
 * enough context to find the line: route, user, status, message, the top
 * of the stack, request id, page URL and browser for client errors.
 *
 * Two guards keep a broken deploy from becoming a thousand mails:
 *
 *   - the same error (source + code + message + first stack frame + route)
 *     is mailed once per DEDUPE_MS; repeats inside the window are counted
 *     and the count rides on the next mail for that signature;
 *   - at most MAX_PER_HOUR mails an hour; past that a single "N more
 *     errors suppressed" line is sent when the hour turns.
 *
 * Fire and forget: a request must never wait on SMTP, and a mail that
 * cannot be sent is logged, not thrown.
 */
const DEDUPE_MS = 15 * 60_000
const MAX_PER_HOUR = 40

const recent = new Map() // signature → { lastSentAt, suppressed }
let sentThisHour = 0
let hourStartedAt = Date.now()
let suppressedThisHour = 0

const FRAME_RE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/

function topFrames(stack, limit = 8) {
  return String(stack ?? '')
    .split('\n')
    .slice(1)
    .filter((line) => FRAME_RE.test(line) && !line.includes('node_modules') && !line.includes('node:internal'))
    .slice(0, limit)
    .map((line) => line.trim())
}

function signatureOf(event) {
  return [event.source, event.code, event.message, topFrames(event.stack, 1)[0] ?? '', event.route ?? ''].join('|')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function row(label, value) {
  if (value === undefined || value === null || value === '') return ''
  return `<tr><td style="padding:4px 10px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all">${escapeHtml(value)}</td></tr>`
}

function render(event, meta) {
  const frames = topFrames(event.stack)
  const title = `[${env.NODE_ENV}] ${event.source.toUpperCase()} ${event.status ?? ''} ${event.code ?? ''} — ${event.message}`.replace(/\s+/g, ' ').trim()
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:760px">
  <h2 style="margin:0 0 6px;font-size:18px">${escapeHtml(title)}</h2>
  <p style="margin:0 0 14px;color:#64748b;font-size:13px">${escapeHtml(new Date(event.at).toISOString())}${meta.suppressed ? ` · ${meta.suppressed} ta takror ${Math.round(DEDUPE_MS / 60000)} daqiqada birlashtirildi` : ''}</p>
  <table style="border-collapse:collapse;font-size:14px">
    ${row('Manba', event.source)}
    ${row("Yo'l", event.route)}
    ${row('Holat / kod', [event.status, event.code].filter(Boolean).join(' / '))}
    ${row('Foydalanuvchi', event.user)}
    ${row('Sahifa (URL)', event.pageUrl)}
    ${row('Komponent', event.component)}
    ${row('Brauzer', event.userAgent)}
    ${row('IP', event.ip)}
    ${row('Request id', event.requestId)}
    ${row("So'rov tanasi (kalitlar)", event.bodyKeys)}
    ${row('Tafsilot', event.details)}
  </table>
  ${frames.length ? `<p style="margin:14px 0 4px;font-size:13px;color:#64748b">Stack (yuqori qatorlar):</p><pre style="margin:0;padding:10px;background:#f1f5f9;border-radius:6px;font-size:12px;white-space:pre-wrap">${escapeHtml(frames.join('\n'))}</pre>` : ''}
  ${event.stack && !frames.length ? `<pre style="margin:10px 0 0;padding:10px;background:#f1f5f9;border-radius:6px;font-size:12px;white-space:pre-wrap">${escapeHtml(String(event.stack).slice(0, 4000))}</pre>` : ''}
  <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">${escapeHtml(env.APP_NAME ?? "Qo'llanma")} · ${escapeHtml(process.env.HOSTNAME ?? '')} · pid ${process.pid}</p>
</div>`
  const text = [
    title,
    new Date(event.at).toISOString(),
    `source: ${event.source}`,
    event.route && `route: ${event.route}`,
    event.user && `user: ${event.user}`,
    event.pageUrl && `page: ${event.pageUrl}`,
    event.requestId && `request: ${event.requestId}`,
    event.details && `details: ${event.details}`,
    frames.length ? `\n${frames.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return { subject: title.slice(0, 180), html, text }
}

function recipient() {
  return env.ERROR_ALERT_EMAIL || env.SUPERADMIN_EMAIL || ''
}

// Swapped in tests for a transport that records instead of sending.
let transportProvider = () => (isMailConfigured() ? getTransport() : null)
export function _useTransportForTests(provider) {
  transportProvider = provider ?? (() => (isMailConfigured() ? getTransport() : null))
}

export function isErrorAlertEnabled() {
  return env.ERROR_ALERT_ENABLED && Boolean(recipient()) && Boolean(transportProvider())
}

/**
 * @param {object} event
 * @param {'api'|'client'|'job'} event.source
 * @param {string} event.message
 * @param {string} [event.stack]
 * @param {string} [event.code]
 * @param {number} [event.status]
 * @param {string} [event.route]      "PATCH /api/v1/users/…"
 * @param {string} [event.user]       "Ism (id, ROLE)"
 * @param {string} [event.requestId]
 * @param {string} [event.pageUrl]
 * @param {string} [event.component]
 * @param {string} [event.userAgent]
 * @param {string} [event.ip]
 * @param {string} [event.bodyKeys]
 * @param {string} [event.details]
 */
export function reportError(event) {
  const full = { at: Date.now(), ...event }
  if (!isErrorAlertEnabled()) return
  try {
    const now = Date.now()
    if (now - hourStartedAt > 3_600_000) {
      const suppressed = suppressedThisHour
      hourStartedAt = now
      sentThisHour = 0
      suppressedThisHour = 0
      if (suppressed) {
        deliver(render({ at: now, source: 'api', message: `${suppressed} ta xato o'tgan soatda yuborilmadi (soatlik chegara)`, code: 'ALERTS_SUPPRESSED' }, {}))
      }
    }
    const signature = signatureOf(full)
    const seen = recent.get(signature)
    if (seen && now - seen.lastSentAt < DEDUPE_MS) {
      seen.suppressed += 1
      return
    }
    if (sentThisHour >= MAX_PER_HOUR) {
      suppressedThisHour += 1
      return
    }
    sentThisHour += 1
    recent.set(signature, { lastSentAt: now, suppressed: 0 })
    // Keep the map small: forget signatures older than the window.
    if (recent.size > 500) {
      for (const [key, value] of recent) if (now - value.lastSentAt > DEDUPE_MS) recent.delete(key)
    }
    deliver(render(full, { suppressed: seen?.suppressed ?? 0 }))
  } catch (error) {
    logger.warn('Error alert could not be prepared', { error: error.message })
  }
}

function deliver({ subject, html, text }) {
  const mailer = transportProvider()
  if (!mailer) return
  mailer
    .sendMail({ from: env.MAIL_FROM, to: recipient(), subject, text, html })
    .then(() => logger.info('Error alert sent', { to: recipient(), subject }))
    .catch((error) => logger.warn('Error alert mail failed', { error: error.message }))
}

/** What the API error middleware reports: the request and its person. */
export function describeRequest(req) {
  const user = req.user ? `${req.user.id} · ${req.user.roleName ?? ''}` : 'anonim'
  return {
    route: `${req.method} ${req.originalUrl}`,
    user,
    requestId: req.id ?? req.headers['x-request-id'] ?? '',
    userAgent: req.headers['user-agent'] ?? '',
    ip: req.ip,
    bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).join(', ') : '',
  }
}

/** Reset — for tests. */
export function _resetErrorAlerts() {
  recent.clear()
  sentThisHour = 0
  suppressedThisHour = 0
  hourStartedAt = Date.now()
}
