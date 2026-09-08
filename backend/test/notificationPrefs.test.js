// AT-15 and AT-16 — what an employee may switch off, and what they may not.
//
//   AT-15  notificationPrefs.COURSE_ASSIGNED.email = false
//          -> the in-app notification still arrives; no email is sent
//   AT-16  PUT {PASSWORD_RESET: {email: false}}
//          -> 400 MANDATORY_NOTIFICATION, and nothing is saved
//
// Both halves are covered now that 1.4 has notify() enqueuing mail: the
// preference is stored, honoured for in-app, and honoured for email — and
// AT-17's other clause, that the in-app notification arrives even when
// delivery fails, is asserted here too, since it is the same code path.
//
// Runs against a live backend (TEST_BASE_URL) like security.test.js, because
// the status code and error code are the assertion in AT-16.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  MANDATORY_NOTIFICATION_TYPES,
  isChannelEnabled,
  isMandatoryNotificationType,
  resolveNotificationPrefs,
} from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Notification } from '../src/models/notification.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { notificationService } from '../src/services/notifications/notification.service.js'
import { MailLog } from '../src/models/mailLog.model.js'
import { deliveryQueue } from '../src/jobs/deliveryQueue.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const PASSWORD = 'PrefsTest123!'
const jshshir = `77${String(Date.now()).slice(-12)}`

let user
let token

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    // Some endpoints answer with no body; callers assert on status.
  }
  return { status: res.status, body }
}

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('the shared rules', () => {
  test('§9.3 — account access, security, compliance and cancelled events', () => {
    for (const type of ['ACCOUNT_CREATED', 'PASSWORD_RESET', 'LOGIN_FROM_NEW_DEVICE', 'CERTIFICATE_EXPIRED', 'COMPLIANCE_RETRAINING_DUE', 'EVENT_CANCELLED', 'EVENT_RESCHEDULED']) {
      assert.ok(isMandatoryNotificationType(type), `${type} should be mandatory`)
    }
    assert.equal(isMandatoryNotificationType('COURSE_ASSIGNED'), false)
  })

  test('an absent preference means enabled, so a new type is on for everyone', () => {
    assert.equal(isChannelEnabled({}, 'COURSE_ASSIGNED', 'email'), true)
    assert.equal(isChannelEnabled({ OTHER_TYPE: { email: false } }, 'COURSE_ASSIGNED', 'email'), true)
    assert.equal(isChannelEnabled({ COURSE_ASSIGNED: { push: false } }, 'COURSE_ASSIGNED', 'email'), true)
  })

  test('a stored false is honoured', () => {
    assert.equal(isChannelEnabled({ COURSE_ASSIGNED: { email: false } }, 'COURSE_ASSIGNED', 'email'), false)
  })

  test('a mandatory type is enabled whatever is stored against it', () => {
    // Belt and braces: the API refuses to store this, but a row written by
    // an older build, a migration or a direct edit must not silence a
    // password reset.
    assert.equal(isChannelEnabled({ PASSWORD_RESET: { email: false } }, 'PASSWORD_RESET', 'email'), true)
  })

  test('resolve expands deviations and flags what is locked', () => {
    const out = resolveNotificationPrefs({ COURSE_ASSIGNED: { email: false } }, ['COURSE_ASSIGNED', 'PASSWORD_RESET'])
    assert.deepEqual(out.COURSE_ASSIGNED, { mandatory: false, inApp: true, email: false, push: true })
    assert.deepEqual(out.PASSWORD_RESET, { mandatory: true, inApp: true, email: true, push: true })
  })
})

describe('AT-15 / AT-16 · notification preferences over HTTP', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — has the server ever been booted against this database?')
    user = await User.create({
      firstName: 'Prefs',
      lastName: 'Test',
      fullName: 'Prefs Test',
      jshshir,
      passwordHash: await hashPassword(PASSWORD),
      roleId: role._id,
    })
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: jshshir, password: PASSWORD }),
    })
    assert.equal(status, 200, `login failed: ${JSON.stringify(body)}`)
    token = body.data.accessToken
  })

  after(async () => {
    await Notification.deleteMany({ userId: user._id })
    await MailLog.deleteMany({ userId: user._id })
    await User.deleteOne({ _id: user._id })
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
    await deliveryQueue.close()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('the endpoint needs a session', async () => {
    assert.equal((await api('/users/me/notification-prefs')).status, 401)
  })

  test('a new account starts with everything on and nothing stored', async () => {
    const { status, body } = await api('/users/me/notification-prefs', { headers: auth() })
    assert.equal(status, 200)
    assert.equal(body.data.locale, 'uz')
    assert.deepEqual(body.data.mandatoryTypes, MANDATORY_NOTIFICATION_TYPES)
    assert.deepEqual(body.data.prefs.COURSE_ASSIGNED, { mandatory: false, inApp: true, email: true, push: true })
    const stored = await User.findById(user._id).lean()
    // Absent, not `{}`: Mongoose strips an empty object on save. Both states
    // mean "nothing switched off" and every reader goes through
    // isChannelEnabled, which is why this reads through `?? {}`.
    assert.deepEqual(stored.notificationPrefs ?? {}, {})
  })

  test('AT-16 · a mandatory type cannot be switched off', async () => {
    const { status, body } = await api('/users/me/notification-prefs', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ PASSWORD_RESET: { email: false } }),
    })
    assert.equal(status, 400)
    assert.equal(body.code, 'MANDATORY_NOTIFICATION')
  })

  test('AT-16 · and nothing is saved by the rejected request', async () => {
    const stored = await User.findById(user._id).lean()
    assert.deepEqual(stored.notificationPrefs ?? {}, {}, 'a rejected request wrote something')
  })

  test('a rejected request saves nothing at all, not even its valid half', async () => {
    // A partial save is worse than a rejection: the user is told nothing was
    // saved and half of it was.
    const { status } = await api('/users/me/notification-prefs', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ COURSE_ASSIGNED: { email: false }, PASSWORD_RESET: { push: false } }),
    })
    assert.equal(status, 400)
    const stored = await User.findById(user._id).lean()
    assert.deepEqual(stored.notificationPrefs ?? {}, {})
  })

  test('AT-15 · a non-mandatory channel can be switched off', async () => {
    const { status, body } = await api('/users/me/notification-prefs', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ COURSE_ASSIGNED: { email: false } }),
    })
    assert.equal(status, 200)
    assert.equal(body.data.prefs.COURSE_ASSIGNED.email, false)
    assert.equal(body.data.prefs.COURSE_ASSIGNED.inApp, true)
  })

  test('only the deviation is stored, never the full matrix', async () => {
    const stored = await User.findById(user._id).lean()
    assert.deepEqual(stored.notificationPrefs, { COURSE_ASSIGNED: { email: false } })
  })

  test('switching a channel back on prunes the row rather than storing true', async () => {
    await api('/users/me/notification-prefs', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ COURSE_ASSIGNED: { email: true } }),
    })
    const stored = await User.findById(user._id).lean()
    assert.deepEqual(stored.notificationPrefs ?? {}, {})
  })

  test('an unknown channel name is refused rather than silently stored', async () => {
    const { status } = await api('/users/me/notification-prefs', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ COURSE_ASSIGNED: { carrierPigeon: false } }),
    })
    assert.equal(status, 400)
  })

  test('AT-15 · switching off in-app suppresses the record, and the rest still arrives', async () => {
    await api('/users/me/notification-prefs', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ COURSE_ASSIGNED: { inApp: false } }),
    })

    const suppressed = await notificationService.notify({
      userId: user._id,
      type: 'COURSE_ASSIGNED',
      vars: { courseTitle: 'Mehnat xavfsizligi' },
    })
    assert.equal(suppressed, null, 'a switched-off channel still delivered')

    const kept = await notificationService.notify({
      userId: user._id,
      type: 'TASK_ASSIGNED',
      vars: { taskTitle: 'Hisobot' },
    })
    assert.ok(kept, 'switching off one type silenced another')

    // Scoped to the two types under test: logging in during `before` now
    // also writes a LOGIN_FROM_NEW_DEVICE alert (1.6), and this assertion is
    // about which of these two was suppressed, not about the inbox total.
    const rows = await Notification.find({
      userId: user._id,
      type: { $in: ['COURSE_ASSIGNED', 'TASK_ASSIGNED'] },
    }).lean()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, 'TASK_ASSIGNED')
  })

  test('a mandatory type is delivered even with in-app switched off in the database', async () => {
    // Written directly, bypassing the API that refuses it — the guarantee is
    // that delivery does not depend on the API having been the only writer.
    await User.updateOne({ _id: user._id }, { $set: { notificationPrefs: { PASSWORD_RESET: { inApp: false } } } })
    const delivered = await notificationService.notify({
      userId: user._id,
      type: 'PASSWORD_RESET',
      vars: { resetUrl: 'https://example.uz/reset', expiryMinutes: 30 },
    })
    assert.ok(delivered, 'a password reset was suppressed by a preference')
    await Notification.deleteMany({ userId: user._id })
    await User.updateOne({ _id: user._id }, { $set: { notificationPrefs: {} } })
  })

  // Inside this suite, not a sibling one: `after` above closes the Mongo
  // connection, and node:test runs sibling suites after it has run.
  test('locale defaults to Uzbek and can be changed', async () => {
    const { status, body } = await api('/users/me/locale', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ locale: 'ru' }),
    })
    assert.equal(status, 200)
    assert.equal(body.data.locale, 'ru')
  })

  test('an unsupported language is refused', async () => {
    const { status } = await api('/users/me/locale', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ locale: 'fr' }),
    })
    assert.equal(status, 400)
  })

  test('notify() writes in the language the account is set to', async () => {
    const written = await notificationService.notify({
      userId: user._id,
      type: 'COURSE_ASSIGNED',
      vars: { courseTitle: 'Mehnat xavfsizligi', deadline: '01.10.2026' },
    })
    assert.match(written.title, /Новый курс/, `expected Russian, got: ${written.title}`)
    await Notification.deleteMany({ userId: user._id })
  })

  test('/users/me reports the locale, so the SPA can preselect it', async () => {
    const { body } = await api('/users/me', { headers: auth() })
    assert.equal(body.data.locale, 'ru')
  })

  // ---- 1.4: notify() now queues the email half ----

  test('AT-15 · with email switched off, the in-app notification arrives and no mail is queued', async () => {
    await User.updateOne({ _id: user._id }, { $set: { email: `prefs-${jshshir}@test.local`, locale: 'uz', notificationPrefs: {} } })
    await api('/users/me/notification-prefs', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ COURSE_ASSIGNED: { email: false } }),
    })
    await MailLog.deleteMany({ userId: user._id })
    await Notification.deleteMany({ userId: user._id })

    const written = await notificationService.notify({
      userId: user._id,
      type: 'COURSE_ASSIGNED',
      vars: { courseTitle: 'Mehnat xavfsizligi' },
    })

    assert.ok(written, 'the in-app notification was not delivered')
    assert.equal(await MailLog.countDocuments({ userId: user._id }), 0, 'mail was queued for a switched-off channel')
  })

  test('with email left on, the same notification does queue mail', async () => {
    await User.updateOne({ _id: user._id }, { $set: { notificationPrefs: {} } })
    await MailLog.deleteMany({ userId: user._id })

    await notificationService.notify({
      userId: user._id,
      type: 'COURSE_ASSIGNED',
      vars: { courseTitle: 'Mehnat xavfsizligi' },
    })

    const logs = await MailLog.find({ userId: user._id }).lean()
    assert.equal(logs.length, 1)
    assert.equal(logs[0].status, 'QUEUED')
    assert.equal(logs[0].templateKey, 'COURSE_ASSIGNED')
    assert.match(logs[0].subject, /Yangi kurs/, `expected the Uzbek subject, got: ${logs[0].subject}`)
    assert.equal(logs[0].to, `prefs-${jshshir}@test.local`)
  })

  test('an account with no email address queues nothing, and is not an error', async () => {
    await User.updateOne({ _id: user._id }, { $unset: { email: 1 } })
    await MailLog.deleteMany({ userId: user._id })
    const written = await notificationService.notify({
      userId: user._id,
      type: 'TASK_ASSIGNED',
      vars: { taskTitle: 'Hisobot' },
    })
    assert.ok(written, 'the in-app notification should still be written')
    assert.equal(await MailLog.countDocuments({ userId: user._id }), 0)
  })

  test('AT-17 · a mail that cannot be delivered does not cost the in-app notification', async () => {
    // The clause AT-17 makes about the *other* side of a failed send. There
    // is no SMTP configured in this run, so the queued job will be recorded
    // SKIPPED rather than sent — either way the notification is already
    // written and pushed before delivery is even attempted.
    await User.updateOne({ _id: user._id }, { $set: { email: `prefs-${jshshir}@test.local` } })
    await MailLog.deleteMany({ userId: user._id })
    await Notification.deleteMany({ userId: user._id })

    const written = await notificationService.notify({
      userId: user._id,
      type: 'COURSE_DEADLINE_APPROACHING',
      vars: { courseTitle: 'X', deadline: '01.10.2026', daysLeft: 2 },
    })

    assert.ok(written)
    assert.equal(await Notification.countDocuments({ userId: user._id }), 1)
    assert.equal(await MailLog.countDocuments({ userId: user._id }), 1)
  })

  test('a mandatory type is mailed even when the stored preference says otherwise', async () => {
    await User.updateOne({ _id: user._id }, { $set: { notificationPrefs: { PASSWORD_RESET: { email: false } } } })
    await MailLog.deleteMany({ userId: user._id })
    await notificationService.notify({
      userId: user._id,
      type: 'PASSWORD_RESET',
      vars: { resetUrl: 'https://example.uz/reset', expiryMinutes: 30 },
    })
    assert.equal(await MailLog.countDocuments({ userId: user._id }), 1, 'a password reset email was suppressed')
    await User.updateOne({ _id: user._id }, { $set: { notificationPrefs: {} } })
  })
})
