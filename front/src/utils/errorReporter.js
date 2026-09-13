import { http } from '@/services/http'

/**
 * Sends what the browser could not handle to POST /client-errors, where it
 * is mailed to the administrator with the page and the browser it happened
 * in (see errorAlert.service.js). Failures the API already answered (a 4xx
 * or 5xx response) are NOT re-sent — the server mailed those itself; only
 * what never reached it is: render errors, uncaught promises, script
 * errors, and requests that got no answer at all.
 *
 * Quiet by design: never throws, never awaited, at most one report per
 * distinct message a minute, none while offline.
 */
const seen = new Map()
const DEDUPE_MS = 60_000

function shouldSend(key) {
  const now = Date.now()
  const last = seen.get(key) ?? 0
  if (now - last < DEDUPE_MS) return false
  seen.set(key, now)
  if (seen.size > 200) for (const [k, t] of seen) if (now - t > DEDUPE_MS) seen.delete(k)
  return true
}

export function reportClientError({ error, kind = 'window', component = '', info = '' }) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    // The API answered — its own alert already went out with the real cause.
    if (error?.response?.status) return
    const message = String(error?.message ?? error ?? 'Unknown error').slice(0, 2000)
    const key = `${kind}|${message}|${component}`
    if (!shouldSend(key)) return
    const payload = {
      message,
      stack: String(error?.stack ?? '').slice(0, 20000),
      kind,
      component: String(component).slice(0, 300),
      info: String(info).slice(0, 300),
      pageUrl: window.location.href.slice(0, 2000),
      route: error?.config ? `${String(error.config.method ?? '').toUpperCase()} ${error.config.url ?? ''}`.slice(0, 500) : '',
      code: String(error?.code ?? '').slice(0, 80),
      release: import.meta.env.VITE_RELEASE ?? '',
    }
    http.post('/client-errors', payload).catch(() => {})
  } catch {
    // Reporting must never be the thing that breaks.
  }
}

/** The component's name and where it sits, for the "Komponent" line. */
export function describeInstance(instance) {
  const name = instance?.$options?.name ?? instance?.$options?.__name ?? instance?.$?.type?.__name ?? ''
  const file = instance?.$options?.__file ?? instance?.$?.type?.__file ?? ''
  return [name, file && file.split('/').slice(-2).join('/')].filter(Boolean).join(' · ')
}
