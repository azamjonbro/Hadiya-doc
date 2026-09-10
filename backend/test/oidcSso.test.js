// 11.4 — OIDC single sign-on.
//
// The identity provider here is a **real one**: a local HTTP server that
// serves a discovery document and a JWKS, and signs ID tokens with a
// freshly generated RSA key. Everything the platform does with a token —
// fetching the key by `kid`, checking the signature, `iss`, `aud`, `exp`
// and the nonce — happens for real against it.
//
// That matters more here than anywhere else in this codebase. Every one of
// these checks is the *only* thing standing between "somebody has a token"
// and "somebody is signed in as an employee", and a mocked verifier would
// pass an implementation that skips any of them.
//
// The env has to be set before the modules that read it are imported, so
// the imports below are dynamic and the fake provider sits on a fixed port.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import mongoose from 'mongoose'

const IDP_PORT = 4622
const ISSUER = `http://127.0.0.1:${IDP_PORT}`
const CLIENT_ID = 'qollanma-test-client'
const REDIRECT_URI = 'http://localhost:4100/api/v1/auth/sso/callback'

process.env.OIDC_ISSUER = ISSUER
process.env.OIDC_CLIENT_ID = CLIENT_ID
process.env.OIDC_CLIENT_SECRET = 'test-client-secret'
process.env.OIDC_REDIRECT_URI = REDIRECT_URI

const { connectDatabase } = await import('../src/config/db.js')
const { User } = await import('../src/models/user.model.js')
const { Role } = await import('../src/models/role.model.js')
const { Settings } = await import('../src/models/settings.model.js')
const { AuditLog } = await import('../src/models/auditLog.model.js')
const { Session } = await import('../src/models/session.model.js')
const { settingsService } = await import('../src/services/settings/settings.service.js')
const { oidcAuthService } = await import('../src/services/integrations/oidcAuth.service.js')
const { verifyIdToken, resetOidcCache, isSsoConfigured } = await import(
  '../src/services/integrations/oidcClient.js'
)
const { mapAttributes, resolveRoleName, emailAllowed } = await import(
  '../src/services/integrations/ssoClaimMap.js'
)
const { redisConnection } = await import('../src/config/redis.js')

const stamp = String(Date.now()).slice(-9)
const KID = `test-key-${stamp}`
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }

let idp
let savedSso
const userIds = []
// What the fake provider will put in the next ID token.
let nextClaims = {}
// code → the PKCE challenge it was issued against, so the token endpoint can
// check the verifier the way a real one does.
const issuedCodes = new Map()

function sign(claims, { alg = 'RS256', kid = KID } = {}) {
  const header = Buffer.from(JSON.stringify({ alg, kid, typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  if (alg === 'none') return `${header}.${body}.`
  if (alg === 'HS256') {
    // The classic confusion attack: sign with the *public* key as an HMAC
    // secret and hope the verifier trusts the header's `alg`.
    const mac = crypto.createHmac('sha256', publicKey.export({ type: 'spki', format: 'pem' })).update(`${header}.${body}`).digest('base64url')
    return `${header}.${body}.${mac}`
  }
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${body}`), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  })
  return `${header}.${body}.${signature.toString('base64url')}`
}

function idTokenFor(overrides = {}, options = {}) {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    {
      iss: ISSUER,
      aud: CLIENT_ID,
      sub: `sub-${stamp}`,
      iat: now,
      exp: now + 300,
      ...nextClaims,
      ...overrides,
    },
    options
  )
}

/** Walks the whole browser flow: start → provider → callback. */
async function signIn({ claims = {}, redirectPath = '' } = {}) {
  const { url } = await oidcAuthService.start({ redirectPath })
  const params = new URL(url).searchParams
  const code = `code-${crypto.randomUUID()}`
  issuedCodes.set(code, {
    challenge: params.get('code_challenge'),
    nonce: params.get('nonce'),
    claims,
  })
  return oidcAuthService.callback(
    { code, state: params.get('state') },
    { ip: '127.0.0.1', userAgent: 'oidc-test' }
  )
}

describe('11.4 · OIDC single sign-on', () => {
  before(async () => {
    await connectDatabase()
    // The settings singleton is shared with the running app, so the SSO
    // section is snapshotted and put back in `after` — a test must not
    // leave single sign-on switched on for the deployment.
    savedSso = (await Settings.findById('global').lean())?.sso ?? null

    idp = http.createServer((req, res) => {
      const url = new URL(req.url, ISSUER)
      const json = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }

      if (url.pathname === '/.well-known/openid-configuration') {
        return json(200, {
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/jwks`,
          id_token_signing_alg_values_supported: ['RS256'],
        })
      }
      if (url.pathname === '/jwks') return json(200, { keys: [jwk] })

      if (url.pathname === '/token' && req.method === 'POST') {
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
          const body = new URLSearchParams(Buffer.concat(chunks).toString())
          const pending = issuedCodes.get(body.get('code'))
          if (!pending) return json(400, { error: 'invalid_grant' })
          issuedCodes.delete(body.get('code'))
          // A real provider checks these, so the fake one does too —
          // otherwise the test would pass with PKCE not implemented.
          if (body.get('client_secret') !== 'test-client-secret') return json(401, { error: 'invalid_client' })
          if (body.get('redirect_uri') !== REDIRECT_URI) {
            return json(400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' })
          }
          const verifier = body.get('code_verifier') ?? ''
          const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
          if (challenge !== pending.challenge) {
            return json(400, { error: 'invalid_grant', error_description: 'PKCE verifier mismatch' })
          }
          nextClaims = { nonce: pending.nonce, ...pending.claims }
          return json(200, { access_token: 'at', token_type: 'Bearer', id_token: idTokenFor() })
        })
        return undefined
      }
      return json(404, { error: 'not_found' })
    })
    await new Promise((resolve) => idp.listen(IDP_PORT, '127.0.0.1', resolve))

    const employee = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employee, 'EMPLOYEE role is missing — boot the server once')

    await settingsService.update(
      { id: new mongoose.Types.ObjectId().toString() },
      {
        sso: {
          enabled: true,
          autoProvision: true,
          defaultRoleName: 'EMPLOYEE',
          allowedEmailDomains: [],
          claims: { jshshir: 'personnel_id', department: 'dept' },
          roleRules: [],
          syncOnLogin: true,
        },
      }
    )
    resetOidcCache()
  })

  after(async () => {
    await User.deleteMany({ _id: { $in: userIds } })
    await AuditLog.deleteMany({ action: { $regex: '^SSO_' }, entityId: { $in: userIds.map(String) } })
    await Session.deleteMany({ userId: { $in: userIds } })
    if (savedSso) {
      await Settings.updateOne({ _id: 'global' }, { $set: { sso: savedSso } })
    } else {
      await Settings.updateOne({ _id: 'global' }, { $unset: { sso: '' } })
    }
    // The cached settings would otherwise keep this suite's SSO section
    // alive in the running app for a minute.
    await settingsService.invalidate?.()
    await redisConnection.del('settings:global')
    await new Promise((resolve) => idp.close(resolve))
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('verifying the ID token', () => {
    test('a token signed by the provider with the right claims is accepted', async () => {
      const claims = await verifyIdToken(idTokenFor({ sub: 'plain' }))
      assert.equal(claims.sub, 'plain')
      assert.equal(isSsoConfigured(), true)
    })

    test('`alg` comes from a fixed table, not from the token', async () => {
      // `alg: none` and the HMAC-with-the-public-key confusion attack are
      // the two ways a verifier that trusts the header gets walked past.
      await assert.rejects(() => verifyIdToken(idTokenFor({}, { alg: 'none' })), { code: 'OIDC_TOKEN_ALG' })
      await assert.rejects(() => verifyIdToken(idTokenFor({}, { alg: 'HS256' })), { code: 'OIDC_TOKEN_ALG' })
    })

    test('a token signed with the wrong key is refused', async () => {
      const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
      const now = Math.floor(Date.now() / 1000)
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' })).toString('base64url')
      const body = Buffer.from(
        JSON.stringify({ iss: ISSUER, aud: CLIENT_ID, sub: 'x', exp: now + 300 })
      ).toString('base64url')
      const signature = crypto
        .sign('sha256', Buffer.from(`${header}.${body}`), {
          key: other.privateKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        })
        .toString('base64url')
      await assert.rejects(() => verifyIdToken(`${header}.${body}.${signature}`), { code: 'OIDC_TOKEN_INVALID' })
    })

    test('an unknown key id is refused, not trusted', async () => {
      await assert.rejects(() => verifyIdToken(idTokenFor({}, { kid: 'nobody' })), { code: 'OIDC_TOKEN_INVALID' })
    })

    test('a token for another application at the same provider is refused', async () => {
      // The confused-deputy case: a perfectly valid token, signed by the
      // right provider, issued to somebody else's client.
      await assert.rejects(() => verifyIdToken(idTokenFor({ aud: 'someone-elses-app' })), {
        code: 'OIDC_TOKEN_AUDIENCE',
      })
      await assert.rejects(
        () => verifyIdToken(idTokenFor({ aud: [CLIENT_ID, 'other'], azp: 'other' })),
        { code: 'OIDC_TOKEN_AUDIENCE' }
      )
    })

    test('another issuer, an expired token and a mismatched nonce are all refused', async () => {
      await assert.rejects(() => verifyIdToken(idTokenFor({ iss: 'https://evil.example' })), {
        code: 'OIDC_TOKEN_ISSUER',
      })
      const past = Math.floor(Date.now() / 1000) - 600
      await assert.rejects(() => verifyIdToken(idTokenFor({ exp: past })), { code: 'OIDC_TOKEN_EXPIRED' })
      // The nonce is what ties a token to the login this browser started;
      // without the check, a token obtained elsewhere replays into it.
      await assert.rejects(() => verifyIdToken(idTokenFor({ nonce: 'wrong' }), { nonce: 'expected' }), {
        code: 'OIDC_TOKEN_NONCE',
      })
    })

    test('a malformed token does not reach the network', async () => {
      await assert.rejects(() => verifyIdToken('not.a.token'), { code: 'OIDC_TOKEN_INVALID' })
      await assert.rejects(() => verifyIdToken(''), { code: 'OIDC_TOKEN_INVALID' })
    })
  })

  describe('the login flow', () => {
    test('PKCE and the nonce are in the authorization URL', async () => {
      const { url } = await oidcAuthService.start()
      const params = new URL(url).searchParams
      assert.equal(params.get('response_type'), 'code')
      assert.equal(params.get('client_id'), CLIENT_ID)
      assert.equal(params.get('redirect_uri'), REDIRECT_URI)
      assert.equal(params.get('code_challenge_method'), 'S256')
      assert.ok(params.get('code_challenge'))
      assert.ok(params.get('nonce'))
      assert.ok(params.get('state'))
      // The verifier itself must never be in the URL — that is the whole
      // point of the pair.
      assert.equal(params.get('code_verifier'), null)
    })

    test('a first sign-in provisions the account and hands over a session', async () => {
      const jshshir = `44${stamp}001`
      const { handoff } = await signIn({
        claims: {
          sub: `provisioned-${stamp}`,
          personnel_id: jshshir,
          email: `sso.${stamp}@example.uz`,
          given_name: 'Sso',
          family_name: 'Probe',
          dept: 'IT',
        },
      })
      assert.ok(handoff)

      const user = await User.findOne({ jshshir })
      assert.ok(user, 'the account was not created')
      userIds.push(user._id)
      assert.equal(user.ssoSubject, `provisioned-${stamp}`)
      assert.equal(user.department, 'IT')
      assert.equal(user.fullName, 'Probe Sso')
      // A random password nobody is told, not a placeholder: a well-known
      // one would be a shared password on every provisioned account.
      assert.match(user.passwordHash, /^\$argon2/)

      const session = await oidcAuthService.exchange(handoff, { ip: '127.0.0.1', userAgent: 'oidc-test' })
      // The same payload a password login returns — one session mechanism.
      assert.ok(session.accessToken)
      assert.ok(session.refreshToken)
      assert.equal(session.user.jshshir, jshshir)
      assert.equal(session.user.role, 'EMPLOYEE')
    })

    test('the handoff code is single-use', async () => {
      const jshshir = `44${stamp}002`
      const { handoff } = await signIn({
        claims: { sub: `once-${stamp}`, personnel_id: jshshir, email: `once.${stamp}@example.uz` },
      })
      const user = await User.findOne({ jshshir })
      userIds.push(user._id)

      await oidcAuthService.exchange(handoff, { ip: '127.0.0.1', userAgent: 'oidc-test' })
      // It travelled in a URL the browser keeps in its history.
      await assert.rejects(() => oidcAuthService.exchange(handoff, { ip: '127.0.0.1', userAgent: 'x' }), {
        code: 'SSO_HANDOFF_UNKNOWN',
      })
    })

    test('a state cannot be replayed, and an unknown one is refused', async () => {
      const { url } = await oidcAuthService.start()
      const params = new URL(url).searchParams
      const code = `code-${crypto.randomUUID()}`
      issuedCodes.set(code, {
        challenge: params.get('code_challenge'),
        nonce: params.get('nonce'),
        claims: { sub: `state-${stamp}`, personnel_id: `44${stamp}003`, email: `state.${stamp}@example.uz` },
      })
      await oidcAuthService.callback({ code, state: params.get('state') }, { ip: '1.1.1.1', userAgent: 'x' })
      const created = await User.findOne({ jshshir: `44${stamp}003` })
      userIds.push(created._id)

      // The state was consumed by its own callback (getdel), so a second
      // callback with it is a replay.
      await assert.rejects(
        () => oidcAuthService.callback({ code: 'another', state: params.get('state') }, { ip: '1.1.1.1', userAgent: 'x' }),
        { code: 'SSO_STATE_UNKNOWN' }
      )
      await assert.rejects(
        () => oidcAuthService.callback({ code: 'x', state: 'never-issued' }, { ip: '1.1.1.1', userAgent: 'x' }),
        { code: 'SSO_STATE_UNKNOWN' }
      )
    })

    test('a callback with no code is refused before anything is consumed', async () => {
      await assert.rejects(() => oidcAuthService.callback({ state: 'x' }, { ip: '1.1.1.1', userAgent: 'x' }), {
        code: 'SSO_CALLBACK_INCOMPLETE',
      })
    })
  })

  describe('who is allowed in', () => {
    test('the subject is what identifies a returning person, not the e-mail', async () => {
      const jshshir = `44${stamp}010`
      await signIn({
        claims: { sub: `stable-${stamp}`, personnel_id: jshshir, email: `first.${stamp}@example.uz` },
      })
      const user = await User.findOne({ jshshir })
      userIds.push(user._id)

      // The mailbox was reassigned — the person is the same, and a match on
      // e-mail is how their successor would end up in this account.
      await signIn({
        claims: { sub: `stable-${stamp}`, personnel_id: jshshir, email: `renamed.${stamp}@example.uz` },
      })
      const after = await User.findById(user._id)
      assert.equal(after.email, `renamed.${stamp}@example.uz`)
      assert.equal(await User.countDocuments({ ssoSubject: `stable-${stamp}` }), 1)
    })

    test('an existing password account is linked, not duplicated', async () => {
      const jshshir = `44${stamp}011`
      const role = await Role.findOne({ name: 'EMPLOYEE' })
      const existing = await User.create({
        firstName: 'Bor',
        lastName: 'Hisob',
        fullName: 'Hisob Bor',
        jshshir,
        passwordHash: 'x',
        roleId: role._id,
        department: 'HR',
      })
      userIds.push(existing._id)

      await signIn({
        claims: { sub: `link-${stamp}`, personnel_id: jshshir, email: `link.${stamp}@example.uz`, dept: 'Buxgalteriya' },
      })
      const linked = await User.findById(existing._id)
      assert.equal(linked.ssoSubject, `link-${stamp}`)
      // Attributes follow the directory, which is the reason to map them.
      assert.equal(linked.department, 'Buxgalteriya')
      assert.equal(await User.countDocuments({ jshshir }), 1)
    })

    test('a deactivated account does not come back through SSO', async () => {
      const jshshir = `44${stamp}012`
      const role = await Role.findOne({ name: 'EMPLOYEE' })
      const gone = await User.create({
        firstName: 'Ketgan',
        lastName: 'Xodim',
        fullName: 'Xodim Ketgan',
        jshshir,
        passwordHash: 'x',
        roleId: role._id,
        isActive: false,
      })
      userIds.push(gone._id)

      // They can still authenticate at the directory; being able to is not
      // permission to be here, which is the point of deactivating.
      await assert.rejects(
        () => signIn({ claims: { sub: `inactive-${stamp}`, personnel_id: jshshir } }),
        { code: 'ACCOUNT_INACTIVE' }
      )
    })

    test('an unknown identity is refused when provisioning is off', async () => {
      await settingsService.update({ id: new mongoose.Types.ObjectId().toString() }, { sso: { autoProvision: false } })
      await assert.rejects(
        () => signIn({ claims: { sub: `nobody-${stamp}`, personnel_id: `44${stamp}013` } }),
        { code: 'SSO_NO_ACCOUNT' }
      )
      await settingsService.update({ id: new mongoose.Types.ObjectId().toString() }, { sso: { autoProvision: true } })
    })

    test('provisioning without the identifier claim is refused, not faked', async () => {
      // The platform keys people by JSHSHIR — it is the login and it is on
      // certificates. Inventing a placeholder would leave somebody to
      // clean it up later.
      await settingsService.update(
        { id: new mongoose.Types.ObjectId().toString() },
        { sso: { claims: { jshshir: '' } } }
      )
      await assert.rejects(
        () => signIn({ claims: { sub: `noid-${stamp}`, email: `noid.${stamp}@example.uz` } }),
        { code: 'SSO_NO_IDENTIFIER_CLAIM' }
      )
      await settingsService.update(
        { id: new mongoose.Types.ObjectId().toString() },
        { sso: { claims: { jshshir: 'personnel_id' } } }
      )
    })

    test('a domain outside the allow-list is refused', async () => {
      await settingsService.update(
        { id: new mongoose.Types.ObjectId().toString() },
        { sso: { allowedEmailDomains: ['company.uz'] } }
      )
      // A shared identity provider will authenticate anybody; the allow-list
      // is what makes that not a login here.
      await assert.rejects(
        () =>
          signIn({
            claims: { sub: `guest-${stamp}`, personnel_id: `44${stamp}014`, email: `guest.${stamp}@gmail.com` },
          }),
        { code: 'SSO_DOMAIN_NOT_ALLOWED' }
      )
      await settingsService.update(
        { id: new mongoose.Types.ObjectId().toString() },
        { sso: { allowedEmailDomains: [] } }
      )
    })

    test('SSO switched off answers 503, and so does an unconfigured deployment', async () => {
      await settingsService.update({ id: new mongoose.Types.ObjectId().toString() }, { sso: { enabled: false } })
      const status = await oidcAuthService.status()
      // "Not configured" and "switched off" are different people's jobs.
      assert.deepEqual(status, { available: false, configured: true, enabled: false, buttonLabel: '' })
      await assert.rejects(() => oidcAuthService.start(), { code: 'SSO_DISABLED' })
      await settingsService.update({ id: new mongoose.Types.ObjectId().toString() }, { sso: { enabled: true } })
      assert.equal((await oidcAuthService.status()).available, true)
    })
  })

  describe('claim → role and department mapping', () => {
    test('a group claim moves somebody into the mapped role', async () => {
      const admin = await Role.findOne({ name: 'ADMIN' })
      assert.ok(admin, 'ADMIN role is missing')
      await settingsService.update(
        { id: new mongoose.Types.ObjectId().toString() },
        { sso: { roleRules: [{ claim: 'groups', equals: 'LMS-Admins', roleName: 'ADMIN' }] } }
      )

      const jshshir = `44${stamp}020`
      await signIn({
        claims: {
          sub: `admin-${stamp}`,
          personnel_id: jshshir,
          email: `admin.${stamp}@example.uz`,
          groups: ['Everyone', 'LMS-Admins'],
        },
      })
      const user = await User.findOne({ jshshir })
      userIds.push(user._id)
      assert.equal(String(user.roleId), String(admin._id))

      // And it follows the directory back down when the group is gone.
      await signIn({ claims: { sub: `admin-${stamp}`, personnel_id: jshshir, groups: ['Everyone'] } })
      const demoted = await User.findById(user._id)
      const employee = await Role.findOne({ name: 'EMPLOYEE' })
      assert.equal(String(demoted.roleId), String(employee._id))

      await settingsService.update({ id: new mongoose.Types.ObjectId().toString() }, { sso: { roleRules: [] } })
    })

    test('with no rules configured, a login never changes somebody’s role', async () => {
      // Without this guard every SSO login would reset users to the default
      // role — including the administrator who set SSO up.
      const admin = await Role.findOne({ name: 'ADMIN' })
      const jshshir = `44${stamp}021`
      const user = await User.create({
        firstName: 'Qo',
        lastName: 'Lda',
        fullName: 'Lda Qo',
        jshshir,
        passwordHash: 'x',
        roleId: admin._id,
      })
      userIds.push(user._id)

      await signIn({ claims: { sub: `norules-${stamp}`, personnel_id: jshshir } })
      const after = await User.findById(user._id)
      assert.equal(String(after.roleId), String(admin._id))
    })

    test('an absent claim does not blank what somebody set by hand', async () => {
      const jshshir = `44${stamp}022`
      await signIn({
        claims: { sub: `keep-${stamp}`, personnel_id: jshshir, email: `keep.${stamp}@example.uz`, dept: 'IT' },
      })
      const user = await User.findOne({ jshshir })
      userIds.push(user._id)
      assert.equal(user.department, 'IT')

      // The provider stops sending `dept`. Clearing the department here
      // would quietly remove people from every department-scoped
      // assignment.
      await signIn({ claims: { sub: `keep-${stamp}`, personnel_id: jshshir } })
      assert.equal((await User.findById(user._id)).department, 'IT')
    })

    test('a rule naming a role that does not exist is a refusal, not a guess', async () => {
      await settingsService.update(
        { id: new mongoose.Types.ObjectId().toString() },
        { sso: { roleRules: [{ claim: 'groups', equals: 'Anything', roleName: 'NO_SUCH_ROLE' }] } }
      )
      await assert.rejects(
        () =>
          signIn({
            claims: { sub: `badrole-${stamp}`, personnel_id: `44${stamp}023`, groups: ['Anything'] },
          }),
        { code: 'SSO_ROLE_UNKNOWN' }
      )
      await settingsService.update({ id: new mongoose.Types.ObjectId().toString() }, { sso: { roleRules: [] } })
    })

    test('the mapper handles what providers actually send', () => {
      const sso = { claims: { jshshir: 'pid', department: 'extension.dept' }, defaultRoleName: 'EMPLOYEE' }
      // Nested claims, a dashed identifier, a list where a string was
      // expected, and only a `name` where the halves were expected.
      const mapped = mapAttributes(
        { pid: '1234-5678-9012-34', name: 'Ali Valiyev', extension: { dept: 'IT' }, email: ['A@B.UZ'] },
        sso
      )
      assert.equal(mapped.jshshir, '12345678901234')
      assert.equal(mapped.firstName, 'Ali')
      assert.equal(mapped.lastName, 'Valiyev')
      // Composed the platform's way round, not the provider's.
      assert.equal(mapped.fullName, 'Valiyev Ali')
      assert.equal(mapped.email, 'a@b.uz')
      assert.equal(mapped.department, 'IT')

      // Group matching is case-sensitive: group names are identifiers, and
      // matching loosely would let a typo grant a role.
      const rules = { roleRules: [{ claim: 'groups', equals: 'LMS-Admins', roleName: 'ADMIN' }], defaultRoleName: 'EMPLOYEE' }
      assert.equal(resolveRoleName({ groups: ['LMS-Admins'] }, rules), 'ADMIN')
      assert.equal(resolveRoleName({ groups: ['lms-admins'] }, rules), 'EMPLOYEE')
      // A subdomain is frequently exactly where the guests are.
      assert.equal(emailAllowed('a@example.uz', ['example.uz']), true)
      assert.equal(emailAllowed('a@guests.example.uz', ['example.uz']), false)
      assert.equal(emailAllowed('anything@anywhere', []), true)
    })
  })

  describe('what gets written down', () => {
    test('a provisioned account and a refusal are both audited', async () => {
      const provisioned = await AuditLog.find({ action: 'SSO_USER_PROVISIONED' }).sort({ createdAt: -1 }).limit(1).lean()
      assert.equal(provisioned.length, 1)
      assert.ok(provisioned[0].metadata.subject)
      const refusals = await AuditLog.find({ action: 'SSO_LOGIN_REFUSED_DOMAIN' }).limit(1).lean()
      // A refused login is the interesting one — somebody with a valid
      // directory account tried to get in and could not.
      assert.equal(refusals.length, 1)
    })
  })
})
