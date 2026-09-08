// Templates, the placeholder allowlist, and the language fallback (1.2).
//
// Two things here are security properties, not conveniences. Templates are
// rows an admin can edit, and `vars` is whatever the calling domain service
// passed — frequently a Mongoose document. Without the allowlist, anyone who
// can edit a template can render `{{passwordHash}}` into an email. And a
// placeholder that survives rendering as literal `{{deadline}}` reaches an
// employee's inbox looking like a broken system.
//
// The rest is the part that was actually wrong before: every notification
// was an English template literal built at the call site, so an Uzbek
// employee read "Deadline approaching:" and nobody without a deploy could
// change a word of it.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { NotificationTemplate, NOTIFICATION_LANGS } from '../src/models/notificationTemplate.model.js'
import {
  notificationTemplateService,
  render,
  extractPlaceholders,
  clearTemplateCache,
} from '../src/services/notifications/notificationTemplate.service.js'
import {
  TEMPLATE_SEED,
  TEMPLATE_TYPES,
} from '../src/services/notifications/notificationTemplates.seed.js'
import { MANDATORY_NOTIFICATION_TYPES } from '@lms/shared'
import {
  validateSeed,
  buildAllRows,
  rowsFor,
} from '../src/scripts/migrateNotificationTemplates.js'
import {
  formatNotificationDate,
  daysUntil,
} from '../src/utils/notificationFormat.js'
import { notificationService } from '../src/services/notifications/notification.service.js'
import { Notification } from '../src/models/notification.model.js'
// notify() reaches the socket layer, which opens a Redis connection at
// import. Held open, it keeps the test process alive after the last
// assertion — hence the explicit disconnect in `after`.
import { redisConnection } from '../src/config/redis.js'

describe('the seed itself', () => {
  test('every placeholder used in the text is on the allowlist', () => {
    // The migration refuses to run otherwise; this fails the build sooner.
    assert.deepEqual(validateSeed(), [])
  })

  test('every type is expanded across all languages and channels', () => {
    // Derived rather than a hardcoded 225: the type list grows (1.3 added
    // CERTIFICATE_EXPIRED and EVENT_RESCHEDULED for §9.3), and a count that
    // has to be edited on every addition is a count nobody trusts.
    assert.equal(NOTIFICATION_LANGS.length, 3)
    assert.equal(buildAllRows().length, TEMPLATE_TYPES.length * 3 * 3)
    assert.ok(TEMPLATE_TYPES.length >= 25, 'the checklist asked for at least 25 types')
  })

  test('every type that may not be switched off has wording to send', () => {
    // The one that would actually hurt: a mandatory type with no template
    // renders as its own name, so a password reset would arrive titled
    // "PASSWORD_RESET".
    for (const type of MANDATORY_NOTIFICATION_TYPES) {
      assert.ok(TEMPLATE_SEED[type], `${type} is mandatory (§9.3) but has no template`)
    }
  })

  test('the three channels are not the same text three times', () => {
    const [inApp, email, push] = rowsFor('COURSE_ASSIGNED', 'uz', TEMPLATE_SEED.COURSE_ASSIGNED)
    assert.equal(inApp.channel, 'IN_APP')
    assert.equal(email.channel, 'EMAIL')
    assert.equal(push.channel, 'PUSH')
    assert.ok(email.body.length > inApp.body.length, 'mail should carry the closing line')
    assert.ok(push.subject.length <= 60, 'push has to fit a lock screen')
    assert.equal(push.body, '')
  })

  test('no type is left untranslated', () => {
    for (const type of TEMPLATE_TYPES) {
      for (const lang of NOTIFICATION_LANGS) {
        assert.ok(TEMPLATE_SEED[type][lang]?.subject, `${type}.${lang} has no subject`)
      }
    }
  })
})

describe('render — the allowlist', () => {
  const allowed = ['courseTitle', 'deadline']

  test('substitutes what is allowed', () => {
    const out = render('Kurs: {{courseTitle}}, muddat {{deadline}}', { courseTitle: 'Mehnat xavfsizligi', deadline: '01.10.2026' }, allowed)
    assert.equal(out.text, 'Kurs: Mehnat xavfsizligi, muddat 01.10.2026')
    assert.deepEqual(out.rejected, [])
  })

  test('refuses a placeholder that is not on the allowlist, and says which', () => {
    const out = render('{{courseTitle}} {{passwordHash}}', { courseTitle: 'A', passwordHash: '$argon2id$secret' }, allowed)
    assert.ok(!out.text.includes('argon2'), 'a non-allowlisted field was rendered into the text')
    assert.deepEqual(out.rejected, ['passwordHash'])
  })

  test('an allowed placeholder with no value never survives as literal braces', () => {
    const out = render('Muddat: {{deadline}}', {}, allowed)
    assert.ok(!out.text.includes('{{'), `left a raw placeholder: ${out.text}`)
  })

  test('a per-language default fills the gap instead of leaving a dangling label', () => {
    const out = render('Muddat: {{deadline}}', {}, allowed, { deadline: 'belgilanmagan' })
    assert.equal(out.text, 'Muddat: belgilanmagan')
  })

  test('the default applies to an empty string too, not only to undefined', () => {
    // formatNotificationDate returns '' for a missing date, which is exactly
    // the case that produced "Tugatish muddati: ." before defaults existed.
    assert.equal(render('Muddat: {{deadline}}', { deadline: '' }, allowed, { deadline: 'belgilanmagan' }).text, 'Muddat: belgilanmagan')
  })

  test('a real value still beats the default', () => {
    assert.equal(render('{{deadline}}', { deadline: '01.10.2026' }, allowed, { deadline: 'belgilanmagan' }).text, '01.10.2026')
  })

  test('extractPlaceholders finds each name once, whitespace or not', () => {
    assert.deepEqual(extractPlaceholders('{{a}} {{ b }} {{a}}').sort(), ['a', 'b'])
    assert.deepEqual(extractPlaceholders(''), [])
  })
})

describe('stored templates', () => {
  before(async () => {
    await connectDatabase()
    clearTemplateCache()
  })

  after(async () => {
    await NotificationTemplate.deleteMany({ type: 'TEST_ONLY_TYPE' })
    clearTemplateCache()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('the migration has been run against this database', async () => {
    // Every assertion below reads seeded rows; without them the failures
    // would look like template bugs rather than a missing migration.
    const count = await NotificationTemplate.countDocuments()
    assert.equal(count, buildAllRows().length, 'run: npm --prefix backend run migrate:templates')
  })

  test('an Uzbek employee gets Uzbek, not English', async () => {
    const out = await notificationTemplateService.render({
      type: 'COURSE_ASSIGNED',
      channel: 'IN_APP',
      lang: 'uz',
      vars: { courseTitle: 'Mehnat xavfsizligi', userName: 'Aziz', deadline: '01.10.2026' },
    })
    assert.equal(out.lang, 'uz')
    assert.equal(out.subject, 'Yangi kurs: Mehnat xavfsizligi')
    assert.match(out.body, /biriktirildi/)
    assert.ok(!/assigned/i.test(out.body), 'English leaked into the Uzbek render')
  })

  test('each language renders its own wording', async () => {
    const vars = { courseTitle: 'X', userName: 'Y', deadline: '01.10.2026' }
    const ru = await notificationTemplateService.render({ type: 'COURSE_ASSIGNED', channel: 'IN_APP', lang: 'ru', vars })
    const en = await notificationTemplateService.render({ type: 'COURSE_ASSIGNED', channel: 'IN_APP', lang: 'en', vars })
    assert.match(ru.subject, /Новый курс/)
    assert.match(en.subject, /New course/)
  })

  test('a missing translation falls back to Uzbek, not to English', async () => {
    await NotificationTemplate.create({
      type: 'TEST_ONLY_TYPE',
      channel: 'IN_APP',
      lang: 'uz',
      subject: 'Faqat o\'zbekcha',
      body: '',
      placeholders: [],
    })
    clearTemplateCache()
    const out = await notificationTemplateService.render({ type: 'TEST_ONLY_TYPE', channel: 'IN_APP', lang: 'ru' })
    assert.equal(out.lang, 'uz')
    assert.equal(out.subject, 'Faqat o\'zbekcha')
  })

  test('an unknown type renders nothing rather than throwing', async () => {
    assert.equal(await notificationTemplateService.render({ type: 'NO_SUCH_TYPE', channel: 'IN_APP', lang: 'uz' }), null)
  })

  test('a disabled row silences that channel without losing the wording', async () => {
    await NotificationTemplate.updateOne({ type: 'TEST_ONLY_TYPE', channel: 'IN_APP', lang: 'uz' }, { enabled: false })
    clearTemplateCache()
    assert.equal(await notificationTemplateService.render({ type: 'TEST_ONLY_TYPE', channel: 'IN_APP', lang: 'uz' }), null)
    const row = await NotificationTemplate.findOne({ type: 'TEST_ONLY_TYPE' }).lean()
    assert.equal(row.subject, 'Faqat o\'zbekcha', 'the text should still be there to switch back on')
  })

  test('an unknown channel is a programming error and throws', async () => {
    await assert.rejects(
      () => notificationTemplateService.render({ type: 'COURSE_ASSIGNED', channel: 'CARRIER_PIGEON', lang: 'uz' }),
      /channel/
    )
  })

  test('a seeded template rejects a field the caller passed but the template may not read', async () => {
    const out = await notificationTemplateService.render({
      type: 'COURSE_ASSIGNED',
      channel: 'IN_APP',
      lang: 'uz',
      vars: { courseTitle: 'X', passwordHash: '$argon2id$leak' },
    })
    assert.ok(!out.body.includes('argon2'))
    assert.ok(!out.subject.includes('argon2'))
  })

  test('an assignment with no deadline reads as a sentence, not as "muddati: ."', async () => {
    const out = await notificationTemplateService.render({
      type: 'COURSE_ASSIGNED',
      channel: 'IN_APP',
      lang: 'uz',
      vars: { courseTitle: 'X', userName: 'Y', deadline: '' },
    })
    assert.match(out.body, /belgilanmagan/)
    assert.ok(!/:\s*\./.test(out.body), `dangling label: ${out.body}`)
  })

  test('notify() renders the stored template instead of a hardcoded English string', async () => {
    // The end of the chain the call sites now go through: reminderJob and
    // the two assignment services pass a type and vars, nothing else.
    const userId = new mongoose.Types.ObjectId()
    try {
      await notificationService.notify({
        userId,
        type: 'COURSE_ASSIGNED',
        vars: { courseTitle: 'Mehnat xavfsizligi', userName: 'Aziz', deadline: '01.10.2026' },
        relatedEntityType: 'Course',
        relatedEntityId: String(new mongoose.Types.ObjectId()),
      })
      const stored = await Notification.findOne({ userId }).lean()
      assert.equal(stored.title, 'Yangi kurs: Mehnat xavfsizligi')
      assert.match(stored.message, /biriktirildi/)
      assert.ok(!/Course assigned/.test(stored.title), 'the old English literal is still being used')
    } finally {
      await Notification.deleteMany({ userId })
    }
  })

  test('an explicit title still wins, so a call site templates cannot express yet is not broken', async () => {
    const userId = new mongoose.Types.ObjectId()
    try {
      await notificationService.notify({
        userId,
        type: 'COURSE_ASSIGNED',
        title: 'Bespoke title',
        message: 'Bespoke message',
      })
      const stored = await Notification.findOne({ userId }).lean()
      assert.equal(stored.title, 'Bespoke title')
      assert.equal(stored.message, 'Bespoke message')
    } finally {
      await Notification.deleteMany({ userId })
    }
  })

  test('a type with no template still produces a notification rather than failing the caller', async () => {
    const userId = new mongoose.Types.ObjectId()
    try {
      await notificationService.notify({ userId, type: 'NO_SUCH_TYPE' })
      const stored = await Notification.findOne({ userId }).lean()
      assert.equal(stored.title, 'NO_SUCH_TYPE')
    } finally {
      await Notification.deleteMany({ userId })
    }
  })

  test('an editor marks a row customized so the seed will not overwrite it', async () => {
    const updated = await notificationTemplateService.update({
      type: 'TEST_ONLY_TYPE',
      channel: 'IN_APP',
      lang: 'uz',
      subject: 'Qo\'lda tuzatilgan',
      enabled: true,
    })
    assert.equal(updated.customized, true)
    assert.equal(updated.subject, 'Qo\'lda tuzatilgan')
    const out = await notificationTemplateService.render({ type: 'TEST_ONLY_TYPE', channel: 'IN_APP', lang: 'uz' })
    assert.equal(out.subject, 'Qo\'lda tuzatilgan', 'the cache was not dropped on write')
  })
})

describe('placeholder values', () => {
  test('dates format in the app timezone, not the server zone', () => {
    // 2026-10-01T20:00Z is already 2026-10-02 in Tashkent (UTC+5). This is
    // the bug the helper exists for: the call sites used toLocaleDateString()
    // with no arguments, which formats in whatever zone the box is in — so a
    // deadline read as a different day depending on the server.
    //
    // The separator is the locale's business (uz-UZ uses /, ru-RU uses .) and
    // is deliberately not asserted; the date is.
    for (const lang of ['uz', 'ru', 'en']) {
      const out = formatNotificationDate(new Date('2026-10-01T20:00:00Z'), lang)
      assert.match(out, /^02[./]10[./]2026$/, `${lang} formatted as ${out}`)
    }
  })

  test('a missing date is empty, so the template default takes over', () => {
    assert.equal(formatNotificationDate(null), '')
    assert.equal(formatNotificationDate(undefined), '')
    assert.equal(formatNotificationDate('not a date'), '')
  })

  test('daysUntil rounds up, so the last day still says 1', () => {
    const now = new Date('2026-09-08T10:00:00Z')
    assert.equal(daysUntil(new Date('2026-09-09T09:00:00Z'), now), 1)
    assert.equal(daysUntil(new Date('2026-09-10T10:00:00Z'), now), 2)
  })

  test('a deadline already passed is 0, never negative', () => {
    const now = new Date('2026-09-08T10:00:00Z')
    assert.equal(daysUntil(new Date('2026-09-01T10:00:00Z'), now), 0)
  })
})
