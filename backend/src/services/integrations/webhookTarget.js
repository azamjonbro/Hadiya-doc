import dns from 'node:dns/promises'
import net from 'node:net'
import { ApiError } from '../../utils/ApiError.js'
import { env } from '../../config/env.js'

/**
 * Where a webhook is allowed to point (11.2).
 *
 * A webhook URL is operator-supplied and the platform fetches it from
 * inside the network — which is the definition of an SSRF primitive. Worse
 * than a plain one: the request carries a signature, so whatever it hits
 * sees a call that looks authentic. On this server that inside includes six
 * neighbour sites, Redis, MinIO and Mongo on loopback.
 *
 * Two gates, because either alone is insufficient:
 *
 *  - **the literal check**, at subscription time, so a bad URL is refused
 *    while somebody is looking at the form rather than failing silently in
 *    a queue an hour later;
 *  - **resolution**, immediately before each send, because a name that
 *    resolved publicly yesterday can resolve to 127.0.0.1 today. A check
 *    only at creation time is bypassed by a DNS record the operator
 *    controls.
 *
 * This is not a full defence — the gap between the resolve and the connect
 * is a real DNS-rebinding window, and closing it means pinning the resolved
 * address into the socket. It raises the cost from "type a URL" to "win a
 * race", and the endpoint is SUPERADMIN-only in the first place.
 */

/**
 * `URL.hostname` keeps the brackets around an IPv6 literal (`[::1]`), and
 * `net.isIP` does not accept them — so without this every IPv6 address
 * reads as a hostname and walks straight past the literal check.
 */
function bareHost(hostname) {
  const value = String(hostname ?? '')
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
}

/** Ranges that are never a legitimate webhook receiver. */
function isBlockedAddress(raw) {
  const address = bareHost(raw)
  const version = net.isIP(address)
  if (version === 4) {
    const [a, b] = address.split('.').map(Number)
    if (a === 127) return true // loopback
    if (a === 10) return true // private
    if (a === 172 && b >= 16 && b <= 31) return true // private
    if (a === 192 && b === 168) return true // private
    if (a === 169 && b === 254) return true // link-local — cloud metadata lives here
    if (a === 100 && b >= 64 && b <= 127) return true // carrier NAT; Tailscale's range
    if (a === 0 || a >= 224) return true // "this host", multicast, reserved
    return false
  }
  if (version === 6) {
    const value = address.toLowerCase()
    if (value === '::1' || value === '::') return true
    if (value.startsWith('fe80') || value.startsWith('fc') || value.startsWith('fd')) return true
    // ::ffff:10.0.0.1 — an IPv4 address wearing an IPv6 coat.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)
    if (mapped) return isBlockedAddress(mapped[1])
    return false
  }
  return false
}

/**
 * Shape and scheme, without touching the network.
 *
 * https only in production. Not pedantry: the delivery carries a signature
 * computed with the shared secret and a body describing who finished what,
 * over http that is readable by every hop between here and there.
 */
export function parseTargetUrl(raw, { allowPrivate = env.WEBHOOK_ALLOW_PRIVATE_TARGETS } = {}) {
  let url
  try {
    url = new URL(String(raw))
  } catch {
    throw ApiError.badRequest('Not a valid URL', 'INVALID_WEBHOOK_URL')
  }
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    throw ApiError.badRequest('A webhook endpoint must be https', 'WEBHOOK_URL_NOT_HTTPS')
  }
  // Credentials in the URL would end up in every delivery log we write.
  if (url.username || url.password) {
    throw ApiError.badRequest('Put credentials in a header, not in the URL', 'WEBHOOK_URL_HAS_CREDENTIALS')
  }
  if (!allowPrivate && net.isIP(bareHost(url.hostname)) && isBlockedAddress(url.hostname)) {
    throw ApiError.badRequest('That address is not reachable from outside', 'WEBHOOK_URL_PRIVATE')
  }
  if (!allowPrivate && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost'))) {
    throw ApiError.badRequest('That address is not reachable from outside', 'WEBHOOK_URL_PRIVATE')
  }
  return url
}

/**
 * The pre-send check. `resolve` is injectable so the guard itself can be
 * tested without owning a domain that points at loopback.
 */
export async function assertResolvableTarget(url, { allowPrivate = env.WEBHOOK_ALLOW_PRIVATE_TARGETS, resolve } = {}) {
  if (allowPrivate) return
  if (net.isIP(bareHost(url.hostname))) return // already checked literally

  const lookup = resolve ?? ((hostname) => dns.lookup(hostname, { all: true }))
  let addresses
  try {
    addresses = await lookup(url.hostname)
  } catch {
    throw ApiError.badRequest(`Could not resolve ${url.hostname}`, 'WEBHOOK_URL_UNRESOLVABLE')
  }
  if (!addresses?.length) {
    throw ApiError.badRequest(`Could not resolve ${url.hostname}`, 'WEBHOOK_URL_UNRESOLVABLE')
  }
  // Every address, not the first: a name that resolves to one public and
  // one private address is the interesting case, not an accident.
  const blocked = addresses.find((entry) => isBlockedAddress(entry.address ?? entry))
  if (blocked) {
    throw ApiError.badRequest('That address is not reachable from outside', 'WEBHOOK_URL_PRIVATE')
  }
}

export const _internals = { isBlockedAddress, bareHost }
