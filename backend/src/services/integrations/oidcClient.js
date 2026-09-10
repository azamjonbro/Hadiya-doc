import crypto from 'node:crypto'
import { ApiError } from '../../utils/ApiError.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'

/**
 * The OIDC protocol half of single sign-on (11.4): discovery, the code
 * exchange, and verifying the ID token.
 *
 * Written against `node:crypto` rather than adding an OIDC library,
 * because what this needs is one flow (authorization code with PKCE) and
 * one signature family (RSA/ECDSA over a JWKS), and the parts that must be
 * exactly right are the parts a library hides — which claims are checked
 * and which are merely present. They are all here, in `verifyIdToken`,
 * where they can be read in one screen.
 *
 * **The ID token is the only thing trusted.** The userinfo endpoint is not
 * called: it returns the same claims without a signature, over a
 * connection this server has to trust for other reasons anyway. A token
 * with a verified signature is evidence; a JSON body is a fetch.
 */

const DISCOVERY_TTL_MS = 60 * 60 * 1000
const JWKS_TTL_MS = 60 * 60 * 1000
// The clock skew tolerated on `exp`/`iat`/`nbf`. Small: an identity
// provider and this server are both on NTP, and a generous window is a
// generous window for a replayed token.
const CLOCK_SKEW_SECONDS = 60

const cache = { discovery: null, discoveryAt: 0, jwks: null, jwksAt: 0 }

export function isSsoConfigured() {
  return Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET && env.OIDC_REDIRECT_URI)
}

function assertConfigured() {
  if (!isSsoConfigured()) {
    throw ApiError.serviceUnavailable(
      'Single sign-on is not configured on this deployment',
      'SSO_NOT_CONFIGURED'
    )
  }
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    // An identity provider that stops answering must fail this login, not
    // hold a request open until the proxy gives up on it.
    signal: AbortSignal.timeout(8000),
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  if (!response.ok) {
    // The provider's own `error_description` is almost always the actual
    // reason ("redirect_uri mismatch", "invalid_client"), and losing it
    // turns a five-minute fix into an afternoon.
    const detail = body?.error_description ?? body?.error ?? text.slice(0, 200)
    throw ApiError.badGateway(`The identity provider answered ${response.status}: ${detail}`, 'OIDC_PROVIDER_ERROR')
  }
  if (!body) throw ApiError.badGateway('The identity provider did not answer with JSON', 'OIDC_PROVIDER_ERROR')
  return body
}

/**
 * The provider's own description of itself.
 *
 * Fetched rather than configured, because the endpoints, the supported
 * algorithms and the JWKS location are the provider's to change — and a
 * hand-configured token endpoint is a login that breaks on the day they
 * move it, with no error that says so.
 */
export async function discover({ force = false } = {}) {
  assertConfigured()
  if (!force && cache.discovery && Date.now() - cache.discoveryAt < DISCOVERY_TTL_MS) return cache.discovery

  const base = env.OIDC_ISSUER.replace(/\/$/, '')
  const document = await getJson(`${base}/.well-known/openid-configuration`)

  // The issuer in the document must be the issuer we asked about. If it is
  // not, something is answering for somebody else's identity provider —
  // and every `iss` check after this one would be checking the wrong name.
  if (document.issuer?.replace(/\/$/, '') !== base) {
    throw ApiError.badGateway(
      `The discovery document claims a different issuer (${document.issuer})`,
      'OIDC_ISSUER_MISMATCH'
    )
  }
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (!document[field]) {
      throw ApiError.badGateway(`The discovery document has no ${field}`, 'OIDC_DISCOVERY_INCOMPLETE')
    }
  }

  cache.discovery = document
  cache.discoveryAt = Date.now()
  return document
}

async function jwks({ force = false } = {}) {
  const document = await discover()
  if (!force && cache.jwks && Date.now() - cache.jwksAt < JWKS_TTL_MS) return cache.jwks
  const keys = await getJson(document.jwks_uri)
  cache.jwks = keys.keys ?? []
  cache.jwksAt = Date.now()
  return cache.jwks
}

/**
 * Finds the signing key for one token header.
 *
 * Refetches once when the `kid` is unknown: providers rotate keys without
 * warning, and a cached JWKS is the ordinary reason a login that worked
 * yesterday stops today. Refetching *only* on an unknown kid keeps that
 * from becoming a request to the provider on every login.
 */
async function signingKey(header) {
  if (!header.kid) throw ApiError.unauthorized('The ID token has no key id', 'OIDC_TOKEN_INVALID')
  let keys = await jwks()
  let match = keys.find((key) => key.kid === header.kid)
  if (!match) {
    keys = await jwks({ force: true })
    match = keys.find((key) => key.kid === header.kid)
  }
  if (!match) throw ApiError.unauthorized('The ID token was signed with an unknown key', 'OIDC_TOKEN_INVALID')
  return match
}

const ALGORITHMS = {
  RS256: { hash: 'sha256', padding: crypto.constants.RSA_PKCS1_PADDING },
  RS384: { hash: 'sha384', padding: crypto.constants.RSA_PKCS1_PADDING },
  RS512: { hash: 'sha512', padding: crypto.constants.RSA_PKCS1_PADDING },
  PS256: { hash: 'sha256', padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
  ES256: { hash: 'sha256', dsaEncoding: 'ieee-p1363' },
  ES384: { hash: 'sha384', dsaEncoding: 'ieee-p1363' },
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

/**
 * Verifies an ID token and returns its claims.
 *
 * The order matters: the signature is checked **before** any claim is read
 * for a decision, because until then the token is a string somebody sent
 * us. `alg` comes from the token, so it is matched against a fixed table —
 * accepting whatever the token names is how `alg: none` and the HMAC
 * confusion attacks work.
 */
export async function verifyIdToken(idToken, { nonce, now = Date.now() } = {}) {
  const parts = String(idToken ?? '').split('.')
  if (parts.length !== 3) throw ApiError.unauthorized('Malformed ID token', 'OIDC_TOKEN_INVALID')

  let header
  try {
    header = decodeSegment(parts[0])
  } catch {
    throw ApiError.unauthorized('Malformed ID token', 'OIDC_TOKEN_INVALID')
  }

  const algorithm = ALGORITHMS[header.alg]
  if (!algorithm) {
    throw ApiError.unauthorized(`Unsupported ID token algorithm: ${header.alg}`, 'OIDC_TOKEN_ALG')
  }

  const jwk = await signingKey(header)
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' })
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`)
  const signature = Buffer.from(parts[2], 'base64url')
  const valid = crypto.verify(
    algorithm.hash,
    signed,
    { key, ...(algorithm.padding ? { padding: algorithm.padding } : {}), ...(algorithm.dsaEncoding ? { dsaEncoding: algorithm.dsaEncoding } : {}) },
    signature
  )
  if (!valid) throw ApiError.unauthorized('The ID token signature does not verify', 'OIDC_TOKEN_INVALID')

  const claims = decodeSegment(parts[1])
  const seconds = Math.floor(now / 1000)
  const issuer = env.OIDC_ISSUER.replace(/\/$/, '')

  if (claims.iss?.replace(/\/$/, '') !== issuer) {
    throw ApiError.unauthorized('The ID token was issued by somebody else', 'OIDC_TOKEN_ISSUER')
  }
  // `aud` may be a string or a list, and our client id must be in it —
  // otherwise this is a valid token for a different application at the same
  // provider, which is exactly the confused-deputy case.
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(env.OIDC_CLIENT_ID)) {
    throw ApiError.unauthorized('The ID token was issued for a different application', 'OIDC_TOKEN_AUDIENCE')
  }
  // With more than one audience the provider must say which party the token
  // is for, and it has to be us (OIDC core 3.1.3.7).
  if (audiences.length > 1 && claims.azp && claims.azp !== env.OIDC_CLIENT_ID) {
    throw ApiError.unauthorized('The ID token was authorised for a different party', 'OIDC_TOKEN_AUDIENCE')
  }
  if (!claims.exp || claims.exp + CLOCK_SKEW_SECONDS < seconds) {
    throw ApiError.unauthorized('The ID token has expired', 'OIDC_TOKEN_EXPIRED')
  }
  if (claims.nbf && claims.nbf - CLOCK_SKEW_SECONDS > seconds) {
    throw ApiError.unauthorized('The ID token is not valid yet', 'OIDC_TOKEN_INVALID')
  }
  if (!claims.sub) throw ApiError.unauthorized('The ID token has no subject', 'OIDC_TOKEN_INVALID')
  // The nonce ties this token to the authorization request this browser
  // started. Without it a token obtained elsewhere can be replayed into
  // somebody else's login.
  if (nonce && claims.nonce !== nonce) {
    throw ApiError.unauthorized('The ID token does not match this login attempt', 'OIDC_TOKEN_NONCE')
  }

  return claims
}

/** The URL the browser is sent to. */
export async function authorizationUrl({ state, nonce, codeChallenge, scopes, prompt }) {
  const document = await discover()
  const url = new URL(document.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', env.OIDC_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.OIDC_REDIRECT_URI)
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  // PKCE on a confidential client as well. The secret already proves who
  // is redeeming the code; PKCE proves it is being redeemed by the same
  // browser that asked for it, which is the part a stolen code defeats.
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (prompt) url.searchParams.set('prompt', prompt)
  return url.toString()
}

/** Redeems the authorization code. Returns the raw token response. */
export async function exchangeCode({ code, codeVerifier }) {
  const document = await discover()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.OIDC_REDIRECT_URI,
    client_id: env.OIDC_CLIENT_ID,
    client_secret: env.OIDC_CLIENT_SECRET,
    code_verifier: codeVerifier,
  })

  const tokens = await getJson(document.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  })
  if (!tokens.id_token) {
    throw ApiError.badGateway('The identity provider returned no ID token', 'OIDC_NO_ID_TOKEN')
  }
  return tokens
}

/** PKCE: a verifier the browser never sees, and its hash, which it does. */
export function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function resetOidcCache() {
  cache.discovery = null
  cache.discoveryAt = 0
  cache.jwks = null
  cache.jwksAt = 0
  logger.debug('OIDC discovery cache cleared')
}
