// 7.6 — platform settings, and the layered-resolution pattern they share.
//
// Two things worth pinning down.
//
// The settings document must never carry a credential: it is read by an
// admin screen, written into every backup and returned by an API, which
// are three places an SMTP password should not be.
//
// And the GLOBAL→COURSE inheritance that the attention and face policies
// each implemented separately is now one function — so the interesting
// question, whether `false` means "off" or "inherit", has a single answer.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import {
  resolveLayered,
  pickStoredLayer,
  splitLayerPatch,
  resolveAttentionPolicy,
  resolveFacePolicy,
  ATTENTION_POLICY_DEFAULTS,
} from '@lms/shared'
import { Settings } from '../src/models/settings.model.js'
import { settingsService } from '../src/services/settings/settings.service.js'
import { cacheDel } from '../src/utils/cache.js'
import { redisConnection } from '../src/config/redis.js'

const actor = { id: new mongoose.Types.ObjectId().toString() }

describe('platform settings (7.6)', () => {
  before(async () => {
    await connectDatabase()
  })

  after(async () => {
    await Settings.deleteOne({ _id: 'global' })
    await cacheDel('settings:global')
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the layered pattern (§1.8)', () => {
    test('later layers win', () => {
      const resolved = resolveLayered({ a: 1, b: 2 }, ['a', 'b'], [{ a: 5 }, { b: 9 }])
      assert.deepEqual(resolved, { a: 5, b: 9 })
    })

    test('null means inherit, false does not', () => {
      // The distinction the whole pattern exists for: a course that
      // switches a check off must not inherit it back from the global
      // policy.
      assert.equal(resolveLayered({ x: true }, ['x'], [{ x: null }]).x, true)
      assert.equal(resolveLayered({ x: true }, ['x'], [{ x: false }]).x, false)
      assert.equal(resolveLayered({ x: 5 }, ['x'], [{ x: 0 }]).x, 0)
    })

    test('an unknown key in a layer is ignored', () => {
      // Only declared fields are copied, so a stray key in a stored
      // document cannot become a setting.
      const resolved = resolveLayered({ a: 1 }, ['a'], [{ a: 2, evil: true }])
      assert.deepEqual(resolved, { a: 2 })
    })

    test('the attention and face policies still behave as they did', () => {
      // Both now call the shared function; this is the regression guard.
      assert.equal(resolveAttentionPolicy({ enabled: true }, { enabled: false }).enabled, false)
      assert.equal(resolveAttentionPolicy({ enabled: true }, { enabled: null }).enabled, true)
      assert.equal(resolveAttentionPolicy().graceSeconds, ATTENTION_POLICY_DEFAULTS.graceSeconds)
      assert.equal(typeof resolveFacePolicy().verifyEveryOpen, 'boolean')
    })

    test('the stored layer keeps only what was set', () => {
      // A Mongoose document carries every schema path; without stripping
      // them, an override would look like it had opinions about all of them.
      assert.deepEqual(pickStoredLayer({ a: 1, b: null, c: undefined }, ['a', 'b', 'c']), { a: 1 })
      assert.equal(pickStoredLayer(null, ['a']), null)
    })

    test('an explicit null is a request to stop overriding', () => {
      const { set, unset } = splitLayerPatch({ a: 3, b: null }, ['a', 'b', 'c'])
      assert.deepEqual(set, { a: 3 })
      assert.deepEqual(unset, ['b'])
    })
  })

  describe('the document', () => {
    test('a first read creates it with defaults', async () => {
      await Settings.deleteOne({ _id: 'global' })
      await cacheDel('settings:global')

      const settings = await settingsService.get()
      assert.equal(settings.locale.defaultLang, 'uz')
      assert.equal(settings.grading.defaultPassScore, 70)
      // A singleton: there is no way to end up with a second row.
      assert.equal(await Settings.countDocuments(), 1)
    })

    test('a patch merges into one section and leaves the rest alone', async () => {
      await settingsService.update(actor, { branding: { appName: 'Qo‘llanma' } })
      const settings = await settingsService.update(actor, { gamification: { pointsPerVideo: 25 } })

      assert.equal(settings.branding.appName, 'Qo‘llanma')
      assert.equal(settings.gamification.pointsPerVideo, 25)
      // Two administrators on two screens must not overwrite each other's
      // unrelated sections.
      assert.equal(settings.grading.defaultPassScore, 70)
    })

    test('an omitted field means "leave it", not "clear it"', async () => {
      const settings = await settingsService.update(actor, { branding: { logoUrl: 'https://x/logo.png' } })
      assert.equal(settings.branding.appName, 'Qo‘llanma')
      assert.equal(settings.branding.logoUrl, 'https://x/logo.png')
    })

    test('a write is visible on the next read, not a minute later', async () => {
      // The cache is invalidated on write. An administrator who changes the
      // company name and does not see it concludes the save button is broken.
      await settingsService.update(actor, { branding: { appName: 'Renamed' } })
      assert.equal((await settingsService.get()).branding.appName, 'Renamed')
    })

    test('one section can be read on its own', async () => {
      assert.equal((await settingsService.section('gamification')).pointsPerVideo, 25)
      assert.deepEqual(await settingsService.section('nonexistent'), {})
    })
  })

  describe('what it must never hold', () => {
    test('no section has a field that looks like a credential', () => {
      // SMTP passwords, storage keys and tokens stay in the environment:
      // this document is read by an admin screen, dumped in every backup
      // and returned by an API.
      const paths = Object.keys(Settings.schema.paths).flatMap((section) => {
        const sub = Settings.schema.path(section)?.schema
        return sub ? Object.keys(sub.paths).map((key) => `${section}.${key}`) : [section]
      })
      // Matched on the end of the field name, not anywhere in it:
      // `passwordMinLength` is a policy, `smtpPassword` is a credential,
      // and a substring test cannot tell them apart.
      const forbidden = paths.filter((path) =>
        /(?:password|secret|token|apikey|credentials?|privatekey)$/i.test(path)
      )
      assert.deepEqual(forbidden, [])
    })

    test('the audit log records which fields changed, not their values', async () => {
      // A settings diff in the audit log would eventually carry something
      // that should not have been logged.
      const { AuditLog } = await import('../src/models/auditLog.model.js')
      await settingsService.update(actor, { mail: { fromEmail: 'noreply@example.com' } })
      const entry = await AuditLog.findOne({ action: 'SETTINGS_UPDATED' }).sort({ createdAt: -1 }).lean()
      assert.ok(entry)
      assert.deepEqual(entry.metadata.fields, ['mail.fromEmail'])
      assert.ok(!JSON.stringify(entry.metadata).includes('noreply@example.com'))
      await AuditLog.deleteMany({ action: 'SETTINGS_UPDATED', actor: actor.id })
    })

    test('a nested section merges key by key rather than being replaced (11.4)', async () => {
      const { Settings } = await import('../src/models/settings.model.js')
      const { AuditLog } = await import('../src/models/auditLog.model.js')
      const saved = (await Settings.findById('global').lean())?.sso ?? null

      await settingsService.update(actor, {
        sso: { claims: { email: 'mail', department: 'dept' } },
      })
      // One changed claim name must not erase the other eight — the shape
      // of data loss that looks like the save worked.
      await settingsService.update(actor, { sso: { claims: { email: 'upn' } } })
      const after = await settingsService.section('sso')
      assert.equal(after.claims.email, 'upn')
      assert.equal(after.claims.department, 'dept')
      assert.deepEqual(
        (await AuditLog.findOne({ action: 'SETTINGS_UPDATED' }).sort({ createdAt: -1 }).lean()).metadata.fields,
        ['sso.claims.email']
      )

      // A list, though, is replaced: merging by index would make removing
      // the first entry impossible.
      await settingsService.update(actor, { sso: { allowedEmailDomains: ['a.uz', 'b.uz'] } })
      await settingsService.update(actor, { sso: { allowedEmailDomains: ['b.uz'] } })
      assert.deepEqual((await settingsService.section('sso')).allowedEmailDomains, ['b.uz'])

      if (saved) await Settings.updateOne({ _id: 'global' }, { $set: { sso: saved } })
      else await Settings.updateOne({ _id: 'global' }, { $unset: { sso: '' } })
      await settingsService.invalidate()
      await AuditLog.deleteMany({ action: 'SETTINGS_UPDATED', actor: actor.id })
    })
  })
})
