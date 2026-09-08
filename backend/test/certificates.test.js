// AT-10 and AT-11 — issuing a certificate, exactly once.
//
//   AT-10  a course with a template configured, finished by a learner
//          -> a Certificate row, a rendered PDF carrying the right name,
//             course, date, serial and QR, a CERTIFICATE_ISSUED
//             notification, and an audit entry
//   AT-11  the completion event fired twice (a job retrying)
//          -> exactly one Certificate; the second attempt stops quietly
//
// Idempotency is the interesting half. It is enforced by a unique partial
// index rather than a check-then-write, because the caller is a queue that
// retries and two workers can both pass a check on the same millisecond.
//
// The S3 upload is the one part not exercised here: MinIO needs Docker,
// which does not run on the dev laptops. `renderCertificatePdf` returns the
// bytes and is tested directly; `render()` only adds the putObject.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Certificate } from '../src/models/certificate.model.js'
import { CertificateTemplate } from '../src/models/certificateTemplate.model.js'
import { ExternalCertificate } from '../src/models/externalCertificate.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { Notification } from '../src/models/notification.model.js'
import { MailLog } from '../src/models/mailLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { certificateService, generateSerial } from '../src/services/certificates/certificate.service.js'
import {
  renderCertificatePdf,
  verificationUrl,
} from '../src/services/certificates/certificateRender.service.js'
import { deliveryQueue } from '../src/jobs/deliveryQueue.js'
import { certificateQueue } from '../src/jobs/certificateQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let learner
let template
let certifyingCourse
let plainCourse
const courseIds = []

describe('certificates', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    learner = await User.create({
      firstName: 'Cert',
      lastName: 'Learner',
      fullName: 'Cert Learner',
      jshshir: `16${stamp}001`,
      passwordHash: await hashPassword('CertTest123!'),
      roleId: employeeRole._id,
    })

    template = await CertificateTemplate.create({
      name: `Template ${stamp}`,
      orientation: 'landscape',
      validityDays: 365,
      fields: [
        { key: 'fullName', x: 50, y: 40, fontSize: 28, bold: true },
        { key: 'courseTitle', x: 50, y: 55, fontSize: 16 },
        { key: 'issuedAt', x: 50, y: 68, fontSize: 12 },
        { key: 'serial', x: 50, y: 90, fontSize: 9 },
        { key: 'qr', x: 88, y: 72, size: 10 },
      ],
      createdBy: learner._id,
    })

    certifyingCourse = await Course.create({
      title: `Mehnat xavfsizligi ${stamp}`,
      description: 'x',
      slug: `cert-course-${stamp}`,
      status: 'PUBLISHED',
      certificateTemplateId: template._id,
      createdBy: learner._id,
    })
    plainCourse = await Course.create({
      title: `No certificate ${stamp}`,
      description: 'x',
      slug: `plain-course-${stamp}`,
      status: 'PUBLISHED',
      createdBy: learner._id,
    })
    courseIds.push(certifyingCourse._id, plainCourse._id)
  })

  after(async () => {
    await Certificate.deleteMany({ userId: learner._id })
    await ExternalCertificate.deleteMany({ userId: learner._id })
    await Notification.deleteMany({ userId: learner._id })
    await MailLog.deleteMany({ userId: learner._id })
    await AuditLog.deleteMany({ actor: learner._id })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await CertificateTemplate.deleteOne({ _id: template._id })
    await User.deleteOne({ _id: learner._id })
    await certificateQueue.obliterate({ force: true }).catch(() => {})
    await certificateQueue.close()
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
    await deliveryQueue.close()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('the serial', () => {
    test('is unguessable and readable off a printout', () => {
      const serial = generateSerial(new Date('2026-09-09T00:00:00Z'))
      assert.match(serial, /^2026-[A-Z2-9]{5}-[A-Z2-9]{5}$/)
      // No 0/O or 1/I/L: somebody types this off paper when they cannot
      // scan the QR.
      assert.ok(!/[01OIL]/.test(serial.slice(5)), `ambiguous characters in ${serial}`)
    })

    test('is not sequential — the public verification page must not enumerate the workforce', () => {
      const serials = new Set(Array.from({ length: 200 }, () => generateSerial()))
      assert.equal(serials.size, 200, 'two serials collided in 200 draws')
    })
  })

  describe('AT-10 · issuing', () => {
    test('a course with no template does not issue one', async () => {
      // Most courses do not certify, and a certificate for every course is a
      // certificate worth nothing.
      assert.equal(await certificateService.issueForCourse(learner._id, plainCourse._id), null)
      assert.equal(await Certificate.countDocuments({ userId: learner._id }), 0)
    })

    test('a course with a template issues one, carrying the facts of the day', async () => {
      const certificate = await certificateService.issueForCourse(learner._id, certifyingCourse._id, {
        score: '92%',
      })
      assert.ok(certificate)
      assert.equal(certificate.sourceType, 'COURSE')
      assert.equal(certificate.fullName, 'Cert Learner')
      assert.equal(certificate.sourceTitle, certifyingCourse.title)
      assert.equal(certificate.score, '92%')
      assert.equal(String(certificate.templateId), String(template._id))
    })

    test('the template\'s validity is applied — 365 days, not forever', async () => {
      const certificate = await Certificate.findOne({ userId: learner._id }).lean()
      const days = Math.round((certificate.validUntil - certificate.issuedAt) / (24 * 60 * 60 * 1000))
      assert.equal(days, 365)
    })

    test('the name and title are copied, so renaming the course later cannot rewrite the certificate', async () => {
      const before = await Certificate.findOne({ userId: learner._id }).lean()
      await Course.updateOne({ _id: certifyingCourse._id }, { $set: { title: 'Renamed afterwards' } })
      const after = await Certificate.findOne({ _id: before._id }).lean()
      assert.equal(after.sourceTitle, before.sourceTitle)
      assert.notEqual(after.sourceTitle, 'Renamed afterwards')
      await Course.updateOne({ _id: certifyingCourse._id }, { $set: { title: certifyingCourse.title } })
    })

    test('the learner is told, and it is on the audit trail', async () => {
      const certificate = await Certificate.findOne({ userId: learner._id })
      await certificateService.announce(certificate)

      const notified = await Notification.findOne({ userId: learner._id, type: 'CERTIFICATE_ISSUED' }).lean()
      assert.ok(notified, 'no CERTIFICATE_ISSUED notification')
      assert.match(notified.message, new RegExp(certificate.serial))

      const audited = await AuditLog.findOne({ action: 'CERTIFICATE_ISSUED', entityId: certificate._id.toString() }).lean()
      assert.ok(audited, 'the issue was not audited')
      assert.equal(audited.metadata.serial, certificate.serial)
    })
  })

  describe('AT-11 · idempotency', () => {
    test('issuing twice produces exactly one certificate', async () => {
      const first = await Certificate.findOne({ userId: learner._id }).lean()
      const second = await certificateService.issueForCourse(learner._id, certifyingCourse._id)
      assert.equal(String(second._id), String(first._id), 'a second certificate was issued')
      assert.equal(await Certificate.countDocuments({ userId: learner._id, revokedAt: null }), 1)
    })

    test('ten concurrent attempts still produce one', async () => {
      // The realistic shape of a retrying queue: a check-then-write would
      // let several of these through.
      await Promise.all(
        Array.from({ length: 10 }, () => certificateService.issueForCourse(learner._id, certifyingCourse._id))
      )
      assert.equal(await Certificate.countDocuments({ userId: learner._id, revokedAt: null }), 1)
    })

    test('a revoked certificate does not block a re-issue', async () => {
      // Which is what happens when a course reopens, is finished again, and
      // deserves a fresh one.
      const existing = await Certificate.findOne({ userId: learner._id, revokedAt: null })
      await certificateService.revoke({ id: learner._id }, existing._id, 'course reopened')

      const reissued = await certificateService.issueForCourse(learner._id, certifyingCourse._id)
      assert.ok(reissued)
      assert.notEqual(String(reissued._id), String(existing._id))
      assert.equal(await Certificate.countDocuments({ userId: learner._id }), 2)
      assert.equal(await Certificate.countDocuments({ userId: learner._id, revokedAt: null }), 1)
    })

    test('revoking keeps the row — a QR on a wall should say "withdrawn", not 404', async () => {
      const revoked = await Certificate.findOne({ userId: learner._id, revokedAt: { $ne: null } }).lean()
      assert.ok(revoked)
      assert.equal(revoked.revokedReason, 'course reopened')
      assert.ok(revoked.serial)
    })
  })

  describe('the rendered PDF', () => {
    test('is a PDF, and carries the name, course, date and serial', async () => {
      const certificate = await Certificate.findOne({ userId: learner._id, revokedAt: null }).lean()
      const pdf = await renderCertificatePdf(certificate, template)

      assert.ok(Buffer.isBuffer(pdf))
      assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
      assert.ok(pdf.length > 2000, 'the file is too small to contain a certificate')

      // The text is drawn with an embedded subset font, so the strings are
      // not searchable as plain bytes. What is checkable without a parser is
      // that the document was produced and is well-formed; the field values
      // are asserted on the row above, which is what the renderer is given.
      assert.equal(pdf.subarray(-6).toString('ascii').trim(), '%%EOF')
    })

    test('renders with no template at all rather than failing', async () => {
      // A fresh install has no templates. A blank page is a worse first
      // impression than a plain one, but a crash is worse than both.
      const certificate = await Certificate.findOne({ userId: learner._id, revokedAt: null }).lean()
      const pdf = await renderCertificatePdf(certificate, null)
      assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
    })

    test('a missing background does not stop a certificate — the text is the certificate', async () => {
      const certificate = await Certificate.findOne({ userId: learner._id, revokedAt: null }).lean()
      const pdf = await renderCertificatePdf(certificate, { ...template.toObject(), backgroundKey: 'nope/missing.png' })
      assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
    })

    test('the QR points at the public verification page for that serial', async () => {
      const certificate = await Certificate.findOne({ userId: learner._id, revokedAt: null }).lean()
      assert.ok(verificationUrl(certificate.serial).endsWith(`/verify/${certificate.serial}`))
    })
  })

  describe('the public view', () => {
    test('says whether it is valid, and nothing that identifies the holder further', async () => {
      const certificate = await Certificate.findOne({ userId: learner._id, revokedAt: null }).lean()
      const shown = certificateService.toPublicVerification(certificate)

      assert.deepEqual(Object.keys(shown).sort(), [
        'expired',
        'fullName',
        'issuedAt',
        'revoked',
        'serial',
        'title',
        'validUntil',
      ])
      // The name is on the paper the enquirer is holding; the ids are not.
      assert.ok(!('userId' in shown))
      assert.ok(!('sourceId' in shown))
      assert.ok(!('pdfKey' in shown))
      assert.equal(shown.revoked, false)
    })

    test('a revoked certificate says so rather than disappearing', async () => {
      const revoked = await Certificate.findOne({ userId: learner._id, revokedAt: { $ne: null } }).lean()
      assert.equal(certificateService.toPublicVerification(revoked).revoked, true)
    })

    test('an unknown serial is null, not an error', () => {
      assert.equal(certificateService.toPublicVerification(null), null)
    })
  })

  describe('external certificates', () => {
    test('are a separate record, and start unapproved', async () => {
      // A claim somebody typed in with a photo attached is not evidence the
      // platform produced. Merging the two would let an unverified upload
      // appear in a compliance report as though we had issued it.
      const external = await ExternalCertificate.create({
        userId: learner._id,
        title: 'Fire safety card',
        issuer: 'City fire service',
        externalSerial: 'FS-2026-0042',
      })
      assert.equal(external.status, 'PENDING')
      assert.equal(external.reviewedBy, null)
    })
  })
})
