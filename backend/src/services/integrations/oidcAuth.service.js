import crypto from 'node:crypto'
import { User } from '../../models/user.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { settingsService } from '../settings/settings.service.js'
import { establishSession } from '../auth/auth.service.js'
import { hashPassword } from '../../utils/hash.js'
import { ApiError } from '../../utils/ApiError.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { redisConnection } from '../../config/redis.js'
import { authorizationUrl, exchangeCode, isSsoConfigured, pkcePair, verifyIdToken } from './oidcClient.js'
import { emailAllowed, mapAttributes, resolveRoleName } from './ssoClaimMap.js'

/**
 * Single sign-on: the login flow, provisioning, and attribute sync (11.4).
 *
 * Authorization code with PKCE, done server-side. The SPA never sees the
 * authorization code or the ID token — it gets a **handoff code**, which
 * it trades for exactly the payload `POST /auth/login` returns. Two
 * reasons that shape rather than the common "redirect with the token in
 * the fragment": a token in a URL is in the browser history, in the
 * referrer of whatever loads next, and in any log that records the
 * redirect; and this way single sign-on ends in the same session
 * mechanics as a password login — one refresh cookie, one CSRF token, one
 * face-verification policy — instead of a parallel one that drifts.
 */

// The pending-authorization window: how long somebody has to finish at the
// provider. Ten minutes covers a password, an MFA prompt and a moment of
// hesitation; it is not a standing invitation.
const STATE_TTL_SECONDS = 600
// The handoff window. Sixty seconds is a redirect and one request — the
// code is single-use anyway, and this bounds how long a copied URL is
// worth anything.
const HANDOFF_TTL_SECONDS = 60

const stateKey = (state) => `sso:state:${state}`
const handoffKey = (code) => `sso:handoff:${code}`

async function ssoSettings() {
  const sso = await settingsService.section('sso')
  return sso ?? {}
}

function assertEnabled(sso) {
  if (!isSsoConfigured()) {
    throw ApiError.serviceUnavailable('Single sign-on is not configured on this deployment', 'SSO_NOT_CONFIGURED')
  }
  if (!sso.enabled) {
    throw ApiError.serviceUnavailable('Single sign-on is switched off', 'SSO_DISABLED')
  }
}

/**
 * Finds the account this identity belongs to.
 *
 * Order matters and is deliberately narrow. The `sub` link is checked
 * first because it is the only identifier the provider guarantees is
 * stable — an e-mail address gets reassigned when somebody leaves and
 * their successor inherits the mailbox, which is precisely how one person
 * ends up signing into another's account. E-mail and the identifier claim
 * are matched only to link an account that exists but has never used SSO.
 */
async function findAccount({ subject, attributes }) {
  const bySubject = await User.findOne({ ssoSubject: subject })
  if (bySubject) return { user: bySubject, matchedBy: 'ssoSubject' }

  if (attributes.jshshir) {
    const byJshshir = await User.findOne({ jshshir: attributes.jshshir })
    if (byJshshir) return { user: byJshshir, matchedBy: 'jshshir' }
  }
  if (attributes.email) {
    const byEmail = await User.findOne({ email: attributes.email })
    if (byEmail) return { user: byEmail, matchedBy: 'email' }
  }
  return { user: null, matchedBy: null }
}

async function resolveRole(claims, sso) {
  const name = resolveRoleName(claims, sso)
  const role = await roleRepository.findByName(name)
  if (!role) {
    // A rule naming a role that does not exist is a configuration mistake,
    // and guessing a role instead would silently grant the wrong access.
    throw ApiError.badRequest(`The SSO mapping names a role that does not exist: ${name}`, 'SSO_ROLE_UNKNOWN')
  }
  return role
}

/**
 * Creates the account for an identity nobody has seen before.
 *
 * **Requires the identifier claim.** This platform keys people by JSHSHIR
 * — it is the login, it is on certificates, it is what an HR export
 * matches on — and a national identifier is not something to invent a
 * placeholder for. A deployment that wants JIT provisioning configures
 * which claim carries it; without one, the login is refused with a message
 * that says exactly that, rather than creating an account with a fabricated
 * identifier that somebody has to clean up later.
 */
async function provision({ subject, attributes, claims, sso, meta }) {
  if (!sso.autoProvision) {
    throw ApiError.forbidden(
      'This identity has no account here, and automatic account creation is switched off',
      'SSO_NO_ACCOUNT'
    )
  }
  if (!attributes.jshshir) {
    throw ApiError.badRequest(
      'Automatic account creation needs the identifier claim configured in the SSO settings',
      'SSO_NO_IDENTIFIER_CLAIM'
    )
  }
  const role = await resolveRole(claims, sso)

  /**
   * Somebody has to have a display name.
   *
   * A minimal ID token carries `sub` and nothing else — no `name`, no
   * `given_name` — which is a perfectly conformant token and was the first
   * thing the tests produced. Falling back to the e-mail local part and
   * then to the identifier keeps the account creatable; refusing the login
   * over a missing display name would be refusing over the least important
   * claim there is, and storing an empty name would put a blank row in
   * every list of people.
   */
  const displayName =
    attributes.fullName ||
    [attributes.lastName, attributes.firstName].filter(Boolean).join(' ') ||
    attributes.email.split('@')[0] ||
    attributes.jshshir

  const user = await User.create({
    firstName: attributes.firstName || displayName,
    lastName: attributes.lastName,
    fullName: displayName,
    jshshir: attributes.jshshir,
    email: attributes.email || undefined,
    department: attributes.department,
    branch: attributes.branch,
    position: attributes.position,
    employeeNumber: attributes.employeeNumber || undefined,
    roleId: role._id,
    ssoSubject: subject,
    ssoProvider: env.OIDC_ISSUER,
    // A random password nobody is told, rather than a null one: the field
    // is required, every code path that verifies it stays unchanged, and
    // the account cannot be entered with a password until somebody resets
    // it deliberately. A well-known placeholder would be a shared password
    // on every provisioned account.
    passwordHash: await hashPassword(crypto.randomBytes(24).toString('base64url')),
  })

  await auditLogRepository.record({
    actor: user._id,
    action: 'SSO_USER_PROVISIONED',
    entity: 'User',
    entityId: user._id.toString(),
    metadata: { subject, email: attributes.email, role: role.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  logger.info('Provisioned a user from SSO', { userId: String(user._id), role: role.name })
  return user
}

/**
 * Brings an existing account in line with the claims.
 *
 * Only the attributes the mapping actually names, and only when they
 * carry a value: a provider that omits `department` must not blank the
 * department somebody set by hand. `isActive` is deliberately untouched —
 * deactivating has consequences (assignments, certificates, a person
 * locked out mid-course) and a claim's absence is far too weak a signal
 * for it.
 */
async function syncAttributes(user, { attributes, claims, sso, subject }) {
  const update = {}
  if (!user.ssoSubject) update.ssoSubject = subject
  if (!user.ssoProvider) update.ssoProvider = env.OIDC_ISSUER

  if (sso.syncOnLogin !== false) {
    for (const field of ['firstName', 'lastName', 'department', 'branch', 'position']) {
      if (attributes[field] && attributes[field] !== user[field]) update[field] = attributes[field]
    }
    if (update.firstName || update.lastName) {
      update.fullName = [update.lastName ?? user.lastName, update.firstName ?? user.firstName]
        .filter(Boolean)
        .join(' ')
    }
    if (attributes.email && attributes.email !== user.email) update.email = attributes.email

    // The role only moves when a rule actually matched. Without this a
    // deployment with no rules would reset every SSO user to the default
    // role on every login — including the administrator who set it up.
    if ((sso.roleRules ?? []).length) {
      const role = await resolveRole(claims, sso)
      if (String(role._id) !== String(user.roleId)) {
        update.roleId = role._id
        await auditLogRepository.record({
          actor: user._id,
          action: 'SSO_ROLE_CHANGED',
          entity: 'User',
          entityId: user._id.toString(),
          metadata: { role: role.name },
        })
      }
    }
  }

  if (!Object.keys(update).length) return user
  return User.findByIdAndUpdate(user._id, { $set: update }, { new: true })
}

export const oidcAuthService = {
  /** What the login page needs to know before drawing anything. */
  async status() {
    const sso = await ssoSettings()
    const configured = isSsoConfigured()
    return {
      // Both, separately: "not configured" is an operator's job and
      // "switched off" is an administrator's, and one message for both
      // sends the wrong person looking.
      available: configured && Boolean(sso.enabled),
      configured,
      enabled: Boolean(sso.enabled),
      buttonLabel: sso.buttonLabel || '',
    }
  },

  /**
   * Starts a login: returns the URL to send the browser to.
   *
   * The state, the nonce and the PKCE verifier live in Redis under the
   * state, not in a cookie. The callback arrives from the identity
   * provider as a cross-site redirect, and a `SameSite=Lax` cookie is not
   * sent on some of those — a login that works in one browser and fails
   * in another with no error is the failure mode being avoided here.
   */
  async start({ redirectPath = '' } = {}) {
    const sso = await ssoSettings()
    assertEnabled(sso)

    const state = crypto.randomBytes(24).toString('base64url')
    const nonce = crypto.randomBytes(24).toString('base64url')
    const { verifier, challenge } = pkcePair()

    await redisConnection.set(
      stateKey(state),
      JSON.stringify({
        nonce,
        verifier,
        // Where to land afterwards — a relative path only, never a URL:
        // an open redirect here would let a phishing page borrow this
        // deployment's login to look genuine.
        redirectPath: redirectPath.startsWith('/') && !redirectPath.startsWith('//') ? redirectPath : '',
        createdAt: Date.now(),
      }),
      'EX',
      STATE_TTL_SECONDS
    )

    const url = await authorizationUrl({
      state,
      nonce,
      codeChallenge: challenge,
      scopes: sso.scopes?.length ? sso.scopes : ['openid', 'profile', 'email'],
    })
    return { url, state }
  },

  /**
   * The provider's redirect: verifies everything and returns a handoff code.
   *
   * Nothing about the session is put in the response here, because the
   * response is a redirect to a browser — see the file comment.
   */
  async callback({ code, state }, meta) {
    const sso = await ssoSettings()
    assertEnabled(sso)

    if (!code || !state) throw ApiError.badRequest('Incomplete callback from the provider', 'SSO_CALLBACK_INCOMPLETE')

    // Read and delete in one step: the state is single-use, and a state
    // that survived its callback is a replayable login.
    const raw = await redisConnection.getdel(stateKey(state))
    if (!raw) {
      throw ApiError.badRequest(
        'This sign-in attempt has expired or was already used — start again',
        'SSO_STATE_UNKNOWN'
      )
    }
    const pending = JSON.parse(raw)

    const tokens = await exchangeCode({ code, codeVerifier: pending.verifier })
    const claims = await verifyIdToken(tokens.id_token, { nonce: pending.nonce })

    const attributes = mapAttributes(claims, sso)
    if (!emailAllowed(attributes.email, sso.allowedEmailDomains)) {
      await auditLogRepository.record({
        action: 'SSO_LOGIN_REFUSED_DOMAIN',
        entity: 'User',
        metadata: { email: attributes.email, subject: claims.sub },
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      throw ApiError.forbidden('That address is not allowed to sign in here', 'SSO_DOMAIN_NOT_ALLOWED')
    }

    const { user: existing, matchedBy } = await findAccount({ subject: claims.sub, attributes })
    let user = existing
    if (!user) {
      user = await provision({ subject: claims.sub, attributes, claims, sso, meta })
    } else {
      // A deactivated account does not come back to life because somebody
      // can still authenticate at the directory — that is the whole point
      // of deactivating it here.
      if (!user.isActive) {
        await auditLogRepository.record({
          actor: user._id,
          action: 'SSO_LOGIN_REFUSED_INACTIVE',
          entity: 'User',
          entityId: user._id.toString(),
          ip: meta.ip,
          userAgent: meta.userAgent,
        })
        throw ApiError.forbidden('This account is deactivated', 'ACCOUNT_INACTIVE')
      }
      user = await syncAttributes(user, { attributes, claims, sso, subject: claims.sub })
    }

    await auditLogRepository.record({
      actor: user._id,
      action: 'SSO_LOGIN_SUCCESS',
      entity: 'User',
      entityId: user._id.toString(),
      metadata: { subject: claims.sub, matchedBy: matchedBy ?? 'provisioned' },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    const handoff = crypto.randomBytes(32).toString('base64url')
    await redisConnection.set(
      handoffKey(handoff),
      JSON.stringify({ userId: String(user._id) }),
      'EX',
      HANDOFF_TTL_SECONDS
    )
    return { handoff, redirectPath: pending.redirectPath }
  },

  /**
   * Trades a handoff code for a session — the same payload `login` returns.
   *
   * Single-use, by `getdel`: the code travels in a URL the browser keeps
   * in its history, so the second attempt to use it must fail.
   */
  async exchange(handoff, meta) {
    if (!handoff) throw ApiError.badRequest('Missing sign-in code', 'SSO_HANDOFF_MISSING')
    const raw = await redisConnection.getdel(handoffKey(String(handoff)))
    if (!raw) throw ApiError.unauthorized('That sign-in code has expired or was already used', 'SSO_HANDOFF_UNKNOWN')

    const { userId } = JSON.parse(raw)
    const user = await userRepository.findById(userId)
    if (!user || !user.isActive) throw ApiError.unauthorized('This account cannot sign in', 'ACCOUNT_INACTIVE')

    // The same path a password login takes from here: face policy, refresh
    // session, CSRF token. One session mechanism, not two.
    return establishSession(user, meta)
  },

  _internals: { findAccount, provision, syncAttributes, resolveRole, STATE_TTL_SECONDS, HANDOFF_TTL_SECONDS },
}
