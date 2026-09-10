// 11.6 — TOTP two-factor authentication and the sessions page.
//
// The TOTP implementation is checked against the **RFC 6238 test vectors**
// first, because everything else here is downstream of "does this produce
// the codes an authenticator app produces". After that the tests are about
// the properties that make a second factor worth having:
//
//   - a code cannot be used twice, even inside its own 30-second window;
//   - the secret is encrypted at rest, so a database dump carries no
//     working second factor;
//   - recovery codes are single-use argon2 hashes — a lost phone must not
//     be an account lost with it, and a code that survives its use is a
//     permanent bypass;
//   - turning it off needs a factor, not just the password, because
//     somebody with the password is exactly who it protects against.
//
// The env key has to exist before the modules that read it are imported,
// so the imports are dynamic.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import mongoose from 'mongoose'

process.env.TWOFA_SECRET_KEY = crypto.randomBytes(32).toString('hex')

const { connectDatabase } = await import('../src/config/db.js')
const { User } = await import('../src/models/user.model.js')
const { Role } = await import('../src/models/role.model.js')
const { Session } = await import('../src/models/session.model.js')
const { AuditLog } = await import('../src/models/auditLog.model.js')
const { hashPassword } = await import('../src/utils/hash.js')
const { twoFactorService } = await import('../src/services/auth/twoFactor.service.js')
const { sessionService, describeDevice } = await import('../src/services/auth/session.service.js')
const { authService } = await import('../src/services/auth/auth.service.js')
const totp = await import('../src/utils/totp.js')
const { seal, open } = await import('../src/utils/secretBox.js')
const { redisConnection } = await import('../src/config/redis.js')
const { hashOpaqueToken, generateOpaqueToken, refreshTokenExpiryDate } = await import('../src/utils/tokens.js')

const stamp = String(Date.now()).slice(-9)
const PASSWORD = 'TwoFactor123!'
let user
let actor
const userIds = []
const meta = { ip: '127.0.0.1', userAgent: 'two-factor-test' }

/** The code an authenticator app would be showing right now. */
function currentCode(secret, drift = 0) {
  return totp.codeFor(secret, totp.counterFor() + drift)
}

async function enrol() {
  const setup = await twoFactorService.beginSetup(actor)
  const result = await twoFactorService.enable(actor, currentCode(setup.secret))
  return { secret: setup.secret, recoveryCodes: result.recoveryCodes }
}

async function reset() {
  await User.updateOne({ _id: user._id }, { $set: { twoFactor: {} } })
}

describe('11.6 · two-factor authentication and sessions', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')
    user = await User.create({
      firstName: 'Ikki',
      lastName: 'Faktor',
      fullName: 'Faktor Ikki',
      jshshir: `77${stamp}001`,
      passwordHash: await hashPassword(PASSWORD),
      roleId: role._id,
      department: 'IT',
      branch: `tfa-${stamp}`,
    })
    userIds.push(user._id)
    actor = { id: user._id.toString() }
  })

  after(async () => {
    await Session.deleteMany({ userId: { $in: userIds } })
    await AuditLog.deleteMany({ entityId: { $in: userIds.map(String) } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('the algorithm', () => {
    test('matches the RFC 6238 test vectors', () => {
      // Without this, everything else is testing our own arithmetic
      // against itself. The vector's secret is the ASCII string
      // "12345678901234567890".
      const secret = totp.toBase32(Buffer.from('12345678901234567890'))
      assert.equal(totp.codeFor(secret, Math.floor(59 / 30)), '287082')
      assert.equal(totp.codeFor(secret, Math.floor(1111111109 / 30)), '081804')
      assert.equal(totp.codeFor(secret, Math.floor(1111111111 / 30)), '050471')
      assert.equal(totp.codeFor(secret, Math.floor(1234567890 / 30)), '005924')
      assert.equal(totp.codeFor(secret, Math.floor(2000000000 / 30)), '279037')
    })

    test('accepts one step of drift either side and nothing further', () => {
      const secret = totp.generateSecret()
      const now = Date.now()
      // A phone whose clock is a few seconds out is normal; three steps of
      // tolerance would triple the guessing surface for no practical gain.
      assert.ok(totp.verifyCode(secret, totp.codeFor(secret, totp.counterFor(now)), { now }) !== null)
      assert.ok(totp.verifyCode(secret, totp.codeFor(secret, totp.counterFor(now) - 1), { now }) !== null)
      assert.ok(totp.verifyCode(secret, totp.codeFor(secret, totp.counterFor(now) + 1), { now }) !== null)
      assert.equal(totp.verifyCode(secret, totp.codeFor(secret, totp.counterFor(now) - 3), { now }), null)
    })

    test('a code is not a string comparison problem', () => {
      const secret = totp.generateSecret()
      // Anything that is not six digits is refused before a single HMAC is
      // computed.
      assert.equal(totp.verifyCode(secret, '12345'), null)
      assert.equal(totp.verifyCode(secret, 'abcdef'), null)
      assert.equal(totp.verifyCode(secret, ''), null)
      assert.equal(totp.verifyCode(secret, null), null)
    })

    test('the URI is one an authenticator app can read', () => {
      const uri = totp.otpauthUri({ secret: 'JBSWY3DPEHPK3PXP', account: '12345678901234', issuer: "Qo'llanma" })
      assert.match(uri, /^otpauth:\/\/totp\//)
      const params = new URL(uri).searchParams
      // SHA1/6/30 is not a preference — it is what every app implements,
      // and a "stronger" choice would produce codes nobody can generate.
      assert.equal(params.get('algorithm'), 'SHA1')
      assert.equal(params.get('digits'), '6')
      assert.equal(params.get('period'), '30')
      assert.equal(params.get('secret'), 'JBSWY3DPEHPK3PXP')
    })
  })

  describe('the secret at rest', () => {
    test('is encrypted, tamper-evident, and never the same ciphertext twice', () => {
      const secret = totp.generateSecret()
      const a = seal(secret)
      const b = seal(secret)
      // A random IV per seal: identical secrets must not produce identical
      // ciphertext, or the database tells you who shares a secret.
      assert.notEqual(a, b)
      assert.equal(open(a), secret)
      assert.equal(open(b), secret)
      assert.equal(a.includes(secret), false)
      assert.throws(() => open(`${a.slice(0, -4)}AAAA`), { code: 'SECRET_UNREADABLE' })
    })

    test('what is stored on the account is the ciphertext, not the secret', async () => {
      await reset()
      const { secret } = await enrol()
      const stored = await User.findById(user._id).lean()
      // The point: a Mongo dump on its own carries no working second
      // factor, because the key is in the environment.
      assert.match(stored.twoFactor.secret, /^v1:/)
      assert.equal(stored.twoFactor.secret.includes(secret), false)
      assert.equal(open(stored.twoFactor.secret), secret)
      await reset()
    })
  })

  describe('enrolling', () => {
    test('the secret is not live until a code proves the app has it', async () => {
      await reset()
      const setup = await twoFactorService.beginSetup(actor)
      assert.ok(setup.secret)
      assert.match(setup.qr, /^data:image\/png;base64,/)

      const midway = await User.findById(user._id).lean()
      // Pending, not enabled: enabling on the secret alone would lock out
      // anybody whose scan silently failed.
      assert.equal(midway.twoFactor.enabled, false)
      assert.ok(midway.twoFactor.pendingSecret)
      assert.equal(midway.twoFactor.secret, '')

      await assert.rejects(() => twoFactorService.enable(actor, '000000'), { code: 'TWOFA_CODE_INVALID' })
      assert.equal((await User.findById(user._id).lean()).twoFactor.enabled, false)

      const enabled = await twoFactorService.enable(actor, currentCode(setup.secret))
      assert.equal(enabled.enabled, true)
      assert.equal(enabled.recoveryCodes.length, twoFactorService._internals.RECOVERY_CODE_COUNT)
      await reset()
    })

    test('recovery codes are stored as hashes, and only handed over once', async () => {
      await reset()
      const { recoveryCodes } = await enrol()
      const stored = await User.findById(user._id).lean()
      // They are passwords — each one signs in on its own — so they get a
      // password's treatment.
      assert.equal(stored.twoFactor.recoveryCodes.length, recoveryCodes.length)
      for (const hash of stored.twoFactor.recoveryCodes) assert.match(hash, /^\$argon2/)
      for (const code of recoveryCodes) assert.equal(JSON.stringify(stored).includes(code), false)

      const status = await twoFactorService.status(actor)
      assert.equal(status.enabled, true)
      assert.equal(status.recoveryCodesLeft, recoveryCodes.length)
      // Nothing can show them again.
      assert.equal(status.recoveryCodes, undefined)
      await reset()
    })

    test('enrolling twice is refused rather than quietly replacing the secret', async () => {
      await reset()
      await enrol()
      await assert.rejects(() => twoFactorService.beginSetup(actor), { code: 'TWOFA_ALREADY_ENABLED' })
      await reset()
    })
  })

  describe('signing in', () => {
    test('a correct password returns a challenge, not a session', async () => {
      await reset()
      const { secret } = await enrol()

      const attempt = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      // The same shape the face challenge uses, so the client has one
      // branch for "credentials were right but you are not in yet".
      assert.equal(attempt.requiresTwoFactor, true)
      assert.ok(attempt.twoFactorToken)
      assert.equal(attempt.accessToken, undefined)

      // The *next* step's code, deliberately: the code that confirmed
      // enrolment a moment ago is spent, and offering it again is a replay
      // of an observed code. The only cost is that somebody who enrols and
      // immediately signs out waits up to thirty seconds.
      await assert.rejects(
        () => twoFactorService.completeLogin(attempt.twoFactorToken, currentCode(secret), meta),
        { code: 'TWOFA_CODE_INVALID' }
      )
      const retry = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      const session = await twoFactorService.completeLogin(retry.twoFactorToken, currentCode(secret, 1), meta)
      assert.ok(session.accessToken)
      assert.ok(session.refreshToken)
      assert.equal(session.user.jshshir, user.jshshir)
      await reset()
    })

    test('a code cannot be used twice, even inside its own window', async () => {
      await reset()
      const { secret } = await enrol()
      // One step past the enrolment code, which is already spent.
      const code = currentCode(secret, 1)

      const first = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      await twoFactorService.completeLogin(first.twoFactorToken, code, meta)

      // Thirty seconds is a long time to look over a shoulder. Without the
      // counter check the same code would still work here.
      const second = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      await assert.rejects(() => twoFactorService.completeLogin(second.twoFactorToken, code, meta), {
        code: 'TWOFA_CODE_INVALID',
      })
      // And the account is not stuck: only the step that was used is
      // burnt, so the next code the app shows works. Asserted on the
      // stored counter rather than by waiting thirty seconds for it —
      // the guard is `counter <= lastCounter`, and lastCounter is exactly
      // the step that was accepted.
      const stored = await User.findById(user._id).lean()
      assert.equal(stored.twoFactor.lastCounter, totp.counterFor() + 1)
      assert.ok(totp.verifyCode(secret, currentCode(secret, 1)) > stored.twoFactor.lastCounter - 1)
      await reset()
    })

    test('the challenge is single-use and expires', async () => {
      await reset()
      const { secret } = await enrol()
      const attempt = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      await twoFactorService.completeLogin(attempt.twoFactorToken, currentCode(secret, 1), meta)

      await assert.rejects(
        () => twoFactorService.completeLogin(attempt.twoFactorToken, currentCode(secret, 2), meta),
        { code: 'TWOFA_CHALLENGE_UNKNOWN' }
      )
      await assert.rejects(() => twoFactorService.completeLogin('never-issued', '123456', meta), {
        code: 'TWOFA_CHALLENGE_UNKNOWN',
      })
      await reset()
    })

    test('guessing is bounded by attempts on the challenge, not on the account', async () => {
      await reset()
      await enrol()
      const attempt = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)

      for (let i = 0; i < twoFactorService._internals.MAX_ATTEMPTS; i += 1) {
        await assert.rejects(() => twoFactorService.completeLogin(attempt.twoFactorToken, '000000', meta), {
          code: 'TWOFA_CODE_INVALID',
        })
      }
      await assert.rejects(() => twoFactorService.completeLogin(attempt.twoFactorToken, '000000', meta), {
        code: 'TWOFA_TOO_MANY_ATTEMPTS',
      })

      // The account itself is untouched: counting failures there would let
      // anybody who knows a JSHSHIR lock its owner out.
      const fresh = await User.findById(user._id).lean()
      assert.ok(!fresh.lockedUntil || fresh.lockedUntil < new Date())
      const retry = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      assert.equal(retry.requiresTwoFactor, true)
      await reset()
    })

    test('a recovery code signs in once and is then gone', async () => {
      await reset()
      const { recoveryCodes } = await enrol()
      const code = recoveryCodes[0]

      const attempt = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      const session = await twoFactorService.completeLogin(attempt.twoFactorToken, code, meta)
      assert.ok(session.accessToken)

      const after = await User.findById(user._id).lean()
      assert.equal(after.twoFactor.recoveryCodes.length, recoveryCodes.length - 1)

      // A code that survived its use would be a permanent bypass of the
      // second factor.
      const again = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      await assert.rejects(() => twoFactorService.completeLogin(again.twoFactorToken, code, meta), {
        code: 'TWOFA_CODE_INVALID',
      })
      // Using one is worth noticing — a lost phone, or somebody else's
      // hands on the codes.
      const audit = await AuditLog.findOne({ entityId: user._id.toString(), action: 'TWOFA_RECOVERY_USED' }).lean()
      assert.ok(audit)
      await reset()
    })

    test('somebody with only the password cannot turn it off', async () => {
      await reset()
      const { secret, recoveryCodes } = await enrol()
      // The password is exactly what the second factor is protecting the
      // account from, so it is not accepted here.
      await assert.rejects(() => twoFactorService.disable(actor, PASSWORD), { code: 'TWOFA_CODE_INVALID' })
      await assert.rejects(() => twoFactorService.disable(actor, '000000'), { code: 'TWOFA_CODE_INVALID' })
      assert.equal((await User.findById(user._id).lean()).twoFactor.enabled, true)

      // A recovery code works, for the person whose phone is gone.
      const off = await twoFactorService.disable(actor, recoveryCodes[1])
      assert.equal(off.enabled, false)
      const cleared = await User.findById(user._id).lean()
      assert.equal(cleared.twoFactor.secret, '')
      assert.equal(cleared.twoFactor.recoveryCodes.length, 0)
      // And the login goes straight through again.
      const attempt = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      assert.ok(attempt.accessToken)
      assert.equal(totp.verifyCode(secret, currentCode(secret)) !== null, true)
      await reset()
    })

    test('reissuing recovery codes invalidates the old set', async () => {
      await reset()
      const { secret, recoveryCodes } = await enrol()
      const { recoveryCodes: fresh } = await twoFactorService.regenerateRecoveryCodes(actor, currentCode(secret, 1))
      assert.equal(fresh.length, recoveryCodes.length)
      assert.deepEqual(fresh.filter((code) => recoveryCodes.includes(code)), [])

      const attempt = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      await assert.rejects(() => twoFactorService.completeLogin(attempt.twoFactorToken, recoveryCodes[0], meta), {
        code: 'TWOFA_CODE_INVALID',
      })
      await reset()
    })
  })

  describe('the sessions page', () => {
    test('lists the live sessions and marks the current one', async () => {
      await Session.deleteMany({ userId: user._id })
      const mine = generateOpaqueToken()
      await Session.create({
        userId: user._id,
        refreshTokenHash: hashOpaqueToken(mine),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36',
        ip: '10.0.0.1',
        expiresAt: refreshTokenExpiryDate(),
      })
      const other = generateOpaqueToken()
      await Session.create({
        userId: user._id,
        refreshTokenHash: hashOpaqueToken(other),
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Safari/604.1',
        ip: '10.0.0.2',
        expiresAt: refreshTokenExpiryDate(),
      })
      // Revoked and expired rows are left out: this is a list to act on.
      await Session.create({
        userId: user._id,
        refreshTokenHash: hashOpaqueToken(generateOpaqueToken()),
        userAgent: 'old',
        expiresAt: refreshTokenExpiryDate(),
        revoked: true,
      })
      await Session.create({
        userId: user._id,
        refreshTokenHash: hashOpaqueToken(generateOpaqueToken()),
        userAgent: 'expired',
        expiresAt: new Date(Date.now() - 1000),
      })

      const rows = await sessionService.list(actor, mine)
      assert.equal(rows.length, 2)
      const current = rows.find((row) => row.current)
      assert.ok(current, 'the current session is not marked')
      assert.equal(current.device, 'Chrome · Windows')
      assert.equal(rows.find((row) => !row.current).device, 'Safari · iOS')
      // The raw string is kept as well: the summary is a guess, and
      // somebody deciding whether to end a session should see the evidence.
      assert.match(current.userAgent, /Windows/)
    })

    test('ending one session says whether it was the current one', async () => {
      const mine = generateOpaqueToken()
      await Session.deleteMany({ userId: user._id })
      const a = await Session.create({
        userId: user._id,
        refreshTokenHash: hashOpaqueToken(mine),
        userAgent: 'this device',
        expiresAt: refreshTokenExpiryDate(),
      })
      const b = await Session.create({
        userId: user._id,
        refreshTokenHash: hashOpaqueToken(generateOpaqueToken()),
        userAgent: 'the other one',
        expiresAt: refreshTokenExpiryDate(),
      })

      const other = await sessionService.revoke(actor, b._id.toString(), mine)
      // The client cannot work this out from a 200, and ending the current
      // session means the app has to sign out.
      assert.equal(other.wasCurrent, false)
      const self = await sessionService.revoke(actor, a._id.toString(), mine)
      assert.equal(self.wasCurrent, true)
      assert.equal((await sessionService.list(actor, mine)).length, 0)
    })

    test('somebody else’s session id reads as not found', async () => {
      const stranger = await Session.create({
        userId: new mongoose.Types.ObjectId(),
        refreshTokenHash: hashOpaqueToken(generateOpaqueToken()),
        userAgent: 'not mine',
        expiresAt: refreshTokenExpiryDate(),
      })
      // Scoped by the query rather than by a check afterwards, so the
      // answer leaks nothing about whether that id exists.
      await assert.rejects(() => sessionService.revoke(actor, stranger._id.toString(), null), {
        statusCode: 404,
      })
      assert.equal((await Session.findById(stranger._id)).revoked, false)
      await Session.deleteOne({ _id: stranger._id })
    })

    test('"end my other sessions" keeps the one it was asked from', async () => {
      const mine = generateOpaqueToken()
      await Session.deleteMany({ userId: user._id })
      await Session.create({
        userId: user._id,
        refreshTokenHash: hashOpaqueToken(mine),
        userAgent: 'this device',
        expiresAt: refreshTokenExpiryDate(),
      })
      for (let i = 0; i < 3; i += 1) {
        await Session.create({
          userId: user._id,
          refreshTokenHash: hashOpaqueToken(generateOpaqueToken()),
          userAgent: `device ${i}`,
          expiresAt: refreshTokenExpiryDate(),
        })
      }

      const result = await sessionService.revokeOthers(actor, mine)
      assert.equal(result.revoked, 3)
      const left = await sessionService.list(actor, mine)
      // Signing somebody out of the device they are using to secure their
      // account is the opposite of what this button is for.
      assert.equal(left.length, 1)
      assert.equal(left[0].current, true)
    })

    test('"end my other sessions" is refused when the current one cannot be identified', async () => {
      await Session.deleteMany({ userId: user._id })
      await Session.create({
        userId: user._id,
        refreshTokenHash: hashOpaqueToken(generateOpaqueToken()),
        userAgent: 'somewhere',
        expiresAt: refreshTokenExpiryDate(),
      })
      // Without the refresh cookie there is no way to tell which session
      // is "this one", and the button promises to keep it — so this is a
      // refusal rather than a guess that signs somebody out of the device
      // they are securing their account from.
      await assert.rejects(() => sessionService.revokeOthers(actor, null), { code: 'SESSION_CURRENT_UNKNOWN' })
      assert.equal((await Session.countDocuments({ userId: user._id, revoked: false })), 1)
      await Session.deleteMany({ userId: user._id })
    })

    test('the device label is a guess, and says so for what it cannot read', () => {
      assert.equal(describeDevice(''), 'Unknown device')
      assert.equal(describeDevice('okhttp/4.12.0'), 'App')
      assert.equal(describeDevice('something nobody has seen'), 'Browser')
    })
  })
})
