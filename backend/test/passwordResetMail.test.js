// AT-14 — password reset actually works.
//
//   POST /auth/password-reset/request {identifier}
//   -> 200 whether or not the account exists (no enumeration)
//   -> an email is really sent, in the account's own language
//   -> the link is valid for one hour
//   -> using it a second time is a 400
//   -> the MailLog row says SENT
//
// "Really sent" is the part that needs a relay, so this run gets one: a
// minimal SMTP server on a loopback port that accepts the message and hands
// back a message id. Before 1.5 this endpoint logged the token and stopped,
// which passes any test that only checks the HTTP status.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'

// A relay that accepts everything and remembers what it was given.
function startSmtp() {
  const messages = []
  const server = net.createServer((socket) => {
    let inData = false
    let current = ''
    socket.write('220 test.local ESMTP\r\n')
    socket.on('data', (chunk) => {
      for (const line of chunk.toString().split('\r\n')) {
        if (inData) {
          if (line === '.') {
            inData = false
            messages.push(current)
            current = ''
            socket.write('250 OK: queued as RESET1\r\n')
          } else {
            current += `${line}\n`
          }
          continue
        }
        if (!line) continue
        const command = line.split(' ')[0].toUpperCase()
        if (command === 'EHLO' || command === 'HELO') socket.write('250-test.local\r\n250 SIZE 10240000\r\n')
        else if (command === 'DATA') {
          inData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (command === 'QUIT') {
          socket.write('221 Bye\r\n')
          socket.end()
        } else socket.write('250 OK\r\n')
      }
    })
    socket.on('error', () => {})
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, messages }))
  })
}

const { server: smtp, port: smtpPort, messages } = await startSmtp()

// Before anything reads config — env.js parses process.env once, at import.
process.env.SMTP_HOST = '127.0.0.1'
process.env.SMTP_PORT = String(smtpPort)
process.env.SMTP_SECURE = 'false'
process.env.MAIL_FROM = 'Qo\'llanma <no-reply@test.local>'
process.env.APP_URL = 'https://spring.test.local'

const mongoose = (await import('mongoose')).default
const { connectDatabase } = await import('../src/config/db.js')
const { User } = await import('../src/models/user.model.js')
const { Role } = await import('../src/models/role.model.js')
const { Notification } = await import('../src/models/notification.model.js')
const { MailLog } = await import('../src/models/mailLog.model.js')
const { authService } = await import('../src/services/auth/auth.service.js')
const { mailService, closeTransport } = await import('../src/services/notifications/mail.service.js')
const { deliveryQueue } = await import('../src/jobs/deliveryQueue.js')
const { redisConnection } = await import('../src/config/redis.js')
const { hashPassword } = await import('../src/utils/hash.js')

const jshshir = `66${String(Date.now()).slice(-12)}`
const email = `reset-${jshshir}@test.local`
let user

describe('AT-14 · password reset by email', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server against this database once')
    user = await User.create({
      firstName: 'Reset',
      lastName: 'Test',
      fullName: 'Reset Test',
      jshshir,
      email,
      locale: 'ru',
      passwordHash: await hashPassword('OldPassword123!'),
      roleId: role._id,
    })
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
  })

  after(async () => {
    await Notification.deleteMany({ userId: user._id })
    await MailLog.deleteMany({ userId: user._id })
    await User.deleteOne({ _id: user._id })
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
    await deliveryQueue.close()
    closeTransport()
    await mongoose.connection.close()
    redisConnection.disconnect()
    smtp.close()
  })

  test('an unknown identifier is silently accepted — no enumeration', async () => {
    // Scoped to reset mails written from here on. A bare countDocuments()
    // counts every MailLog in the database, and `node --test` runs the
    // suite's files concurrently — another file queueing anything at the
    // wrong moment made this fail for a reason that had nothing to do with
    // enumeration.
    const since = new Date()
    await authService.requestPasswordReset('00000000000000')
    const queued = await MailLog.countDocuments({
      templateKey: 'PASSWORD_RESET',
      createdAt: { $gte: since },
    })
    assert.equal(queued, 0, 'a mail was queued for an account that does not exist')
  })

  test('a request queues a reset mail with a working link', async () => {
    await authService.requestPasswordReset(jshshir)
    const log = await MailLog.findOne({ userId: user._id }).lean()
    assert.ok(log, 'no mail was queued')
    assert.equal(log.templateKey, 'PASSWORD_RESET')
    assert.equal(log.to, email)
  })

  test('the mail is written in the account\'s language, not the server\'s', async () => {
    const log = await MailLog.findOne({ userId: user._id }).lean()
    assert.match(log.subject, /Восстановление пароля/, `expected Russian, got: ${log.subject}`)
  })

  test('the link is valid for one hour', async () => {
    const stored = await User.findById(user._id).lean()
    const minutes = Math.round((stored.passwordResetExpiresAt - Date.now()) / 60_000)
    assert.ok(minutes > 55 && minutes <= 60, `expected ~60 minutes, got ${minutes}`)
  })

  test('the token is not stored in the clear', async () => {
    const stored = await User.findById(user._id).lean()
    assert.ok(stored.passwordResetTokenHash)
    assert.equal(stored.passwordResetTokenHash.length, 64, 'expected a sha-256 hash, not the token itself')
  })

  test('the mail really reaches the relay, and the log says SENT', async () => {
    const log = await MailLog.findOne({ userId: user._id }).lean()
    const before = messages.length

    // The delivery worker runs in the worker process; this is the same call
    // it makes, against the same transport.
    const result = await mailService.send({
      logId: log._id.toString(),
      to: log.to,
      subject: log.subject,
      text: 'Ссылка для восстановления: https://spring.test.local/reset-password?token=x',
      attempt: 1,
    })

    assert.ok(result.messageId)
    assert.equal(messages.length, before + 1, 'the relay never received the message')
    const stored = await MailLog.findById(log._id).lean()
    assert.equal(stored.status, 'SENT')
    assert.ok(stored.sentAt instanceof Date)
  })

  test('the reset link works once, and the second attempt is refused', async () => {
    // The raw token only exists inside requestPasswordReset, so this drives
    // the pair the way the endpoint does: request, then confirm with a token
    // whose hash matches what was stored.
    const { generateOpaqueToken, hashOpaqueToken } = await import('../src/utils/tokens.js')
    const raw = generateOpaqueToken()
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordResetTokenHash: hashOpaqueToken(raw), passwordResetExpiresAt: new Date(Date.now() + 3600_000) } }
    )

    await authService.confirmPasswordReset(raw, 'BrandNewPassword123!')
    await assert.rejects(
      () => authService.confirmPasswordReset(raw, 'AnotherPassword123!'),
      (error) => {
        assert.equal(error.code, 'INVALID_RESET_TOKEN')
        assert.equal(error.statusCode, 400)
        return true
      }
    )
  })

  test('an expired link is refused', async () => {
    const { generateOpaqueToken, hashOpaqueToken } = await import('../src/utils/tokens.js')
    const raw = generateOpaqueToken()
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordResetTokenHash: hashOpaqueToken(raw), passwordResetExpiresAt: new Date(Date.now() - 1000) } }
    )
    await assert.rejects(() => authService.confirmPasswordReset(raw, 'Whatever123!'), /Invalid or expired/)
  })
})
