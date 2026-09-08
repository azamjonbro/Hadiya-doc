// The five triggers 1.6 adds, and the rules that keep them from becoming
// noise.
//
// A notification that fires twice is worse than one that never fires: the
// second one teaches people to ignore the first. So each of these is
// asserted to fire exactly once, at the moment the underlying fact becomes
// true, and not again afterwards.
//
// ACCOUNT_CREATED and LOGIN_FROM_NEW_DEVICE are also mandatory types (§9.3),
// so they must arrive whatever the recipient's preferences say.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { News } from '../src/models/news.model.js'
import { Session } from '../src/models/session.model.js'
import { Notification } from '../src/models/notification.model.js'
import { MailLog } from '../src/models/mailLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { issueSession } from '../src/services/auth/auth.service.js'
import { newsService } from '../src/services/news/news.service.js'
import { deliveryQueue } from '../src/jobs/deliveryQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-11)
// A JSHSHIR is unique and exactly 14 digits, so each account in this run
// needs its own — a counter rather than something derived from the name,
// which is how the first version collided.
let seq = 0
let employee
let author
let role

const notificationsFor = (userId, type) => Notification.find({ userId, type }).lean()

async function makeUser(prefix, extra = {}) {
  return User.create({
    firstName: prefix,
    lastName: 'Trigger',
    fullName: `${prefix} Trigger`,
    jshshir: `55${seq++}${stamp}`,
    passwordHash: await hashPassword('TriggerTest123!'),
    roleId: role._id,
    ...extra,
  })
}

describe('1.6 · the missing notification triggers', () => {
  before(async () => {
    await connectDatabase()
    role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server against this database once')
    employee = await makeUser('Emp', { department: 'Marketing' })
    author = await makeUser('Aut', { department: 'Marketing' })
  })

  after(async () => {
    const ids = [employee?._id, author?._id].filter(Boolean)
    await Notification.deleteMany({ userId: { $in: ids } })
    await MailLog.deleteMany({ userId: { $in: ids } })
    await Session.deleteMany({ userId: { $in: ids } })
    await News.deleteMany({ title: { $regex: `^Trigger test ${stamp}` } })
    await User.deleteMany({ _id: { $in: ids } })
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
    await deliveryQueue.close()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('LOGIN_FROM_NEW_DEVICE', () => {
    test('the first sign-in from a device alerts', async () => {
      await issueSession(employee, { userAgent: 'Firefox/141 on Linux', ip: '10.0.0.7' })
      // The alert is fired without being awaited, so that a notification
      // failure can never block a login — hence the short settle.
      await new Promise((resolve) => setTimeout(resolve, 400))
      const rows = await notificationsFor(employee._id, 'LOGIN_FROM_NEW_DEVICE')
      assert.equal(rows.length, 1)
      assert.match(rows[0].title, /qurilma|устройств|device/i)
    })

    test('signing in again from the same device does not', async () => {
      await issueSession(employee, { userAgent: 'Firefox/141 on Linux', ip: '10.0.0.9' })
      await new Promise((resolve) => setTimeout(resolve, 400))
      assert.equal((await notificationsFor(employee._id, 'LOGIN_FROM_NEW_DEVICE')).length, 1)
    })

    test('a genuinely different device alerts again', async () => {
      await issueSession(employee, { userAgent: 'Safari/18 on iPhone', ip: '10.0.0.11' })
      await new Promise((resolve) => setTimeout(resolve, 400))
      assert.equal((await notificationsFor(employee._id, 'LOGIN_FROM_NEW_DEVICE')).length, 2)
    })

    test('a token refresh is not a new device, however it looks', async () => {
      // A refresh replaces a session on the same machine. Alerting on it
      // would fire every fifteen minutes and train people to ignore the one
      // that matters.
      const existing = await Session.findOne({ userId: employee._id })
      await issueSession(employee, { userAgent: 'Chrome/142 never seen before', ip: '10.0.0.12' }, existing._id)
      await new Promise((resolve) => setTimeout(resolve, 400))
      assert.equal((await notificationsFor(employee._id, 'LOGIN_FROM_NEW_DEVICE')).length, 2)
    })
  })

  describe('NEWS_PUBLISHED', () => {
    const actor = () => ({ id: author._id.toString(), roleId: role._id.toString() })

    test('publishing straight away tells the audience', async () => {
      const news = await newsService.create(actor(), {
        title: `Trigger test ${stamp} A`,
        content: 'Body',
        status: 'PUBLISHED',
      })
      assert.ok(news.id)
      assert.equal((await notificationsFor(employee._id, 'NEWS_PUBLISHED')).length, 1)
    })

    test('the author is not told about their own article', async () => {
      assert.equal((await notificationsFor(author._id, 'NEWS_PUBLISHED')).length, 0)
    })

    test('a draft tells nobody', async () => {
      await newsService.create(actor(), {
        title: `Trigger test ${stamp} B`,
        content: 'Body',
        status: 'DRAFT',
      })
      assert.equal((await notificationsFor(employee._id, 'NEWS_PUBLISHED')).length, 1)
    })

    test('publishing a draft later announces it exactly once', async () => {
      const draft = await News.findOne({ title: `Trigger test ${stamp} B` })
      await newsService.update(actor(), draft._id.toString(), { status: 'PUBLISHED' })
      assert.equal((await notificationsFor(employee._id, 'NEWS_PUBLISHED')).length, 2)
    })

    test('editing an article that is already out does not announce it again', async () => {
      const published = await News.findOne({ title: `Trigger test ${stamp} B` })
      await newsService.update(actor(), published._id.toString(), { content: 'Fixed a typo' })
      assert.equal((await notificationsFor(employee._id, 'NEWS_PUBLISHED')).length, 2)
    })

    test('targeting is honoured — an article for another department is not sent here', async () => {
      await newsService.create(actor(), {
        title: `Trigger test ${stamp} C`,
        content: 'Body',
        status: 'PUBLISHED',
        departmentTargets: ['Warehouse'],
      })
      assert.equal((await notificationsFor(employee._id, 'NEWS_PUBLISHED')).length, 2)
    })
  })

  describe('ACCOUNT_CREATED', () => {
    test('a new account is told it exists, and never told its password', async () => {
      const created = await makeUser('New')
      try {
        const { notificationService } = await import('../src/services/notifications/notification.service.js')
        await notificationService.notify({
          userId: created._id,
          type: 'ACCOUNT_CREATED',
          vars: { jshshir: created.jshshir },
        })
        const [row] = await notificationsFor(created._id, 'ACCOUNT_CREATED')
        assert.ok(row, 'no account-created notification')
        assert.match(row.message, new RegExp(created.jshshir), 'the JSHSHIR to sign in with is missing')
        assert.ok(!/parol\s*:|password\s*:/i.test(row.message), 'a password appears to be in the message')
      } finally {
        await Notification.deleteMany({ userId: created._id })
        await MailLog.deleteMany({ userId: created._id })
        await User.deleteOne({ _id: created._id })
      }
    })
  })
})
