// AT-17 — delivery retries, and the record it leaves behind.
//
//   GIVEN the SMTP server answers 500
//   WHEN  a notification is sent
//   THEN  BullMQ retries 5 times with exponential backoff, and the MailLog
//         row ends at attempts = 5, status = 'FAILED', with `error` filled.
//
// Run against a real SMTP conversation on a real socket rather than a stub
// transport: the failure this covers is a relay refusing a message, and a
// stub that throws a JS error proves nothing about whether nodemailer's own
// error handling reaches the queue.
//
// Two things are deliberately separated below. The retry *policy* (5
// attempts, exponential, 30s) is asserted on the job the production
// enqueueMail() actually creates. The retry *behaviour* is then exercised on
// a throwaway queue with a 25ms backoff, because the real schedule takes
// seven and a half minutes to exhaust and a test that waits that long is a
// test nobody runs.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { Queue, Worker } from 'bullmq'

// A minimal SMTP server, standing in for the relay.
//
// It refuses any recipient whose address contains "fail" and accepts every
// other one, so a single server on a single port covers both the rejection
// AT-17 is about and the ordinary success path beside it — which matters,
// because a delivery layer that only ever fails in its tests has never been
// shown to deliver anything.
function startSmtp() {
  const accepted = []
  const server = net.createServer((socket) => {
    let inData = false
    socket.write('220 test.local ESMTP\r\n')
    socket.on('data', (chunk) => {
      for (const line of chunk.toString().split('\r\n')) {
        if (inData) {
          if (line === '.') {
            inData = false
            socket.write('250 OK: queued as ABC123\r\n')
          }
          continue
        }
        if (!line) continue
        const command = line.split(' ')[0].toUpperCase()
        if (command === 'EHLO' || command === 'HELO') {
          socket.write('250-test.local\r\n250 SIZE 10240000\r\n')
        } else if (command === 'RCPT') {
          if (/fail/i.test(line)) {
            socket.write('500 Internal error\r\n')
          } else {
            accepted.push(line)
            socket.write('250 OK\r\n')
          }
        } else if (command === 'DATA') {
          inData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (command === 'QUIT') {
          socket.write('221 Bye\r\n')
          socket.end()
        } else {
          socket.write('250 OK\r\n')
        }
      }
    })
    socket.on('error', () => {})
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: server.address().port, accepted })
    )
  })
}

const { server: smtp, port: smtpPort, accepted: acceptedRcpt } = await startSmtp()

// Set before anything reads config: env.js parses process.env once, at
// import, and the SMTP host is not in backend/.env. Hence dynamic imports
// throughout this file rather than static ones, which would hoist above this.
process.env.SMTP_HOST = '127.0.0.1'
process.env.SMTP_PORT = String(smtpPort)
process.env.SMTP_SECURE = 'false'
process.env.MAIL_FROM = 'Qo\'llanma <no-reply@test.local>'

const { env } = await import('../src/config/env.js')
const { connectDatabase } = await import('../src/config/db.js')
const { MailLog } = await import('../src/models/mailLog.model.js')
const { mailService, closeTransport } = await import('../src/services/notifications/mail.service.js')
const { deliveryQueue, enqueueMail, handleDeliveryFailure, DELIVERY_ATTEMPTS } = await import(
  '../src/jobs/deliveryQueue.js'
)
const { redisConnection } = await import('../src/config/redis.js')
const mongoose = (await import('mongoose')).default

const TEST_QUEUE = 'delivery-test'
const RECIPIENT = 'at17-fail@test.local'
const GOOD_RECIPIENT = 'at17-ok@test.local'

describe('AT-17 · delivery retries and the mail log', () => {
  let testQueue
  let worker

  before(async () => {
    await connectDatabase()
    await MailLog.deleteMany({ to: { $in: [RECIPIENT, GOOD_RECIPIENT] } })
    await deliveryQueue.obliterate({ force: true })
    testQueue = new Queue(TEST_QUEUE, { connection: redisConnection })
    await testQueue.obliterate({ force: true })
  })

  after(async () => {
    await worker?.close()
    await MailLog.deleteMany({ to: { $in: [RECIPIENT, GOOD_RECIPIENT] } })
    await testQueue?.obliterate({ force: true })
    await testQueue?.close()
    await deliveryQueue.obliterate({ force: true })
    await deliveryQueue.close()
    closeTransport()
    await mongoose.connection.close()
    redisConnection.disconnect()
    smtp.close()
  })

  test('the queued job carries the retry policy the checklist asks for', async () => {
    const log = await enqueueMail({ to: RECIPIENT, subject: 'policy check', text: 'x' })
    const [job] = await deliveryQueue.getJobs(['waiting', 'delayed', 'prioritized'])

    assert.equal(job.opts.attempts, DELIVERY_ATTEMPTS)
    assert.equal(DELIVERY_ATTEMPTS, 5)
    assert.equal(job.opts.backoff.type, 'exponential')
    assert.equal(job.opts.backoff.delay, 30_000)
    assert.equal(job.data.logId, log._id.toString())
    await deliveryQueue.obliterate({ force: true })
  })

  test('the log row exists before the first attempt, so a dropped job still leaves a trace', async () => {
    const log = await enqueueMail({ to: RECIPIENT, subject: 'queued state', text: 'x' })
    const stored = await MailLog.findById(log._id).lean()
    assert.equal(stored.status, 'QUEUED')
    assert.equal(stored.attempts, 0)
    assert.equal(stored.error, null)
    await MailLog.deleteMany({ to: RECIPIENT })
    await deliveryQueue.obliterate({ force: true })
  })

  test('a 500 from the relay leaves attempts=5, status=FAILED and the error text', async () => {
    const log = await mailService.createLog({ to: RECIPIENT, subject: 'AT-17' })

    const finished = new Promise((resolve) => {
      worker = new Worker(
        TEST_QUEUE,
        (job) => mailService.send({ ...job.data, attempt: job.attemptsMade + 1 }),
        { connection: redisConnection, concurrency: 1 }
      )
      worker.on('failed', (job, error) => {
        handleDeliveryFailure(job, error)
          .then((gaveUp) => gaveUp && resolve())
          .catch(resolve)
      })
    })

    await testQueue.add(
      'mail',
      { logId: log._id.toString(), to: RECIPIENT, subject: 'AT-17', text: 'body' },
      { attempts: DELIVERY_ATTEMPTS, backoff: { type: 'exponential', delay: 25 } }
    )

    await finished

    const stored = await MailLog.findById(log._id).lean()
    assert.equal(stored.attempts, 5, 'the relay should have been tried five times')
    assert.equal(stored.status, 'FAILED')
    assert.ok(stored.error, 'the failure was recorded without saying what went wrong')
    assert.match(stored.error, /500/, `expected the relay's own 500 in the error, got: ${stored.error}`)
    assert.equal(stored.sentAt, null)
    assert.equal(stored.messageId, null)
  })

  test('the attempt counter climbs while retries are still pending, rather than jumping at the end', async () => {
    // Asserted through send() directly: mid-flight state is otherwise a race
    // against the worker, and the guarantee under test is that each attempt
    // writes its own number.
    const log = await mailService.createLog({ to: RECIPIENT, subject: 'counter' })
    await assert.rejects(() =>
      mailService.send({ logId: log._id.toString(), to: RECIPIENT, subject: 'counter', text: 'x', attempt: 2 })
    )
    const stored = await MailLog.findById(log._id).lean()
    assert.equal(stored.attempts, 2)
    assert.equal(stored.status, 'QUEUED', 'a message still being retried must not read as FAILED')
    assert.ok(stored.error)
  })

  test('an accepted recipient is actually delivered and recorded as SENT', async () => {
    const log = await mailService.createLog({ to: GOOD_RECIPIENT, subject: 'welcome' })
    const before = acceptedRcpt.length

    const result = await mailService.send({
      logId: log._id.toString(),
      to: GOOD_RECIPIENT,
      subject: 'welcome',
      text: 'Salom',
      attempt: 1,
    })

    assert.ok(result.messageId, 'nodemailer returned no message id')
    assert.equal(acceptedRcpt.length, before + 1, 'the relay never saw the recipient')
    assert.match(acceptedRcpt.at(-1), new RegExp(GOOD_RECIPIENT))

    const stored = await MailLog.findById(log._id).lean()
    assert.equal(stored.status, 'SENT')
    assert.equal(stored.attempts, 1)
    assert.equal(stored.error, null)
    assert.ok(stored.sentAt instanceof Date)
    assert.ok(stored.messageId)
  })

  test('SMTP is configured for this run, so the failures above are the relay refusing, not a missing config', () => {
    assert.equal(env.SMTP_HOST, '127.0.0.1')
    assert.equal(env.SMTP_PORT, smtpPort)
    assert.ok(env.MAIL_FROM)
  })
})
