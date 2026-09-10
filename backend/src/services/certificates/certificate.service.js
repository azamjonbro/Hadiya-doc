import { randomBytes } from 'node:crypto'
import { Certificate } from '../../models/certificate.model.js'
import { CertificateTemplate } from '../../models/certificateTemplate.model.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { LearningPath } from '../../models/learningPath.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'
import { logger } from '../../config/logger.js'
import { emitWebhookEvent } from '../integrations/webhook.service.js'

/**
 * Issuing, and the rules that keep one completion from producing two
 * certificates.
 *
 * The serial is the public handle: it goes in the QR, in the verification
 * URL, and on the paper. So it has to be unguessable — a sequential number
 * would let anyone enumerate the workforce through the public verification
 * page — and readable enough to be typed off a printout by someone who
 * cannot scan it.
 */

// No 0/O, 1/I/L: this gets read off paper and typed in.
const SERIAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const SERIAL_BODY_LENGTH = 10

export function generateSerial(now = new Date()) {
  const bytes = randomBytes(SERIAL_BODY_LENGTH)
  let body = ''
  for (const byte of bytes) body += SERIAL_ALPHABET[byte % SERIAL_ALPHABET.length]
  // Year prefix so a serial says roughly when it was issued without being
  // sequential within that year.
  return `${now.getUTCFullYear()}-${body.slice(0, 5)}-${body.slice(5)}`
}

function expiryFrom(template, issuedAt) {
  const days = template?.validityDays ?? 0
  if (!days) return null
  return new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000)
}

export const certificateService = {
  /**
   * Issues a certificate for a completed course, once.
   *
   * Idempotency is the unique partial index, not a check-then-write: this is
   * called from a queue that retries, and two workers can both pass a check.
   * A duplicate-key error is the *expected* outcome of a retry and returns
   * the certificate that already exists rather than raising (AT-11).
   */
  async issueForCourse(userId, courseId, { score = '' } = {}) {
    const [user, course] = await Promise.all([
      userRepository.findById(String(userId)),
      courseRepository.findById(String(courseId)),
    ])
    if (!user || !course) return null
    // A course with no template configured does not issue one. Silent on
    // purpose: most courses do not certify, and warning on every completion
    // would bury the failures that matter.
    if (!course.certificateTemplateId) return null

    const template = await CertificateTemplate.findById(course.certificateTemplateId).lean()
    const issuedAt = new Date()

    try {
      return await Certificate.create({
        serial: generateSerial(issuedAt),
        userId: user._id,
        sourceType: 'COURSE',
        sourceId: course._id,
        templateId: template?._id ?? null,
        // Copied, not joined: a course renamed in two years must not rewrite
        // a certificate that stated something true on the day it was earned.
        fullName: user.fullName,
        sourceTitle: course.title,
        score,
        issuedAt,
        validUntil: expiryFrom(template, issuedAt),
      })
    } catch (error) {
      if (error.code === 11000) {
        // Already issued. The retry did its job by doing nothing.
        return Certificate.findOne({
          userId: user._id,
          sourceType: 'COURSE',
          sourceId: course._id,
          revokedAt: null,
        })
      }
      throw error
    }
  },

  /**
   * The same, for a finished learning path.
   *
   * Separate from issueForCourse rather than generalised over a model: the
   * two read different fields (a path carries its own validityDays, a
   * course borrows the template's) and the unique index is on
   * `sourceType`, so conflating them would let one person hold a course
   * certificate and a path certificate that block each other.
   */
  async issueForPath(userId, pathId, { score = '' } = {}) {
    const [user, path] = await Promise.all([
      userRepository.findById(String(userId)),
      LearningPath.findById(String(pathId)).lean(),
    ])
    if (!user || !path || !path.certificateTemplateId) return null

    const template = await CertificateTemplate.findById(path.certificateTemplateId).lean()
    const issuedAt = new Date()
    // A path states its own validity; the template's is the fallback for a
    // course, which has nowhere else to put it.
    const validUntil = path.validityDays
      ? new Date(issuedAt.getTime() + path.validityDays * 24 * 60 * 60 * 1000)
      : expiryFrom(template, issuedAt)

    try {
      return await Certificate.create({
        serial: generateSerial(issuedAt),
        userId: user._id,
        sourceType: 'PATH',
        sourceId: path._id,
        templateId: template?._id ?? null,
        fullName: user.fullName,
        sourceTitle: path.title,
        score,
        issuedAt,
        validUntil,
      })
    } catch (error) {
      if (error.code === 11000) {
        return Certificate.findOne({ userId: user._id, sourceType: 'PATH', sourceId: path._id, revokedAt: null })
      }
      throw error
    }
  },

  /** Tells the learner, and records that it happened. */
  async announce(certificate) {
    await auditLogRepository.record({
      actor: certificate.userId,
      action: 'CERTIFICATE_ISSUED',
      entity: 'Certificate',
      entityId: certificate._id.toString(),
      metadata: {
        serial: certificate.serial,
        sourceType: certificate.sourceType,
        sourceId: String(certificate.sourceId ?? ''),
      },
    })

    try {
      await notificationService.notify({
        userId: certificate.userId,
        type: 'CERTIFICATE_ISSUED',
        vars: {
          courseTitle: certificate.sourceTitle,
          certificateNumber: certificate.serial,
          validUntil: certificate.validUntil ? formatNotificationDate(certificate.validUntil) : '',
        },
        relatedEntityType: 'Certificate',
        relatedEntityId: certificate._id.toString(),
      })
    } catch (error) {
      logger.warn('Certificate notification failed', {
        serial: certificate.serial,
        error: error.message,
      })
    }

    // 11.2 — emitted from `announce` rather than from the two `issueFor*`
    // methods: those are called from a queue that retries, and a
    // duplicate-key retry returns the certificate that already exists, so
    // emitting there would send the same issue twice. `announce` runs once,
    // on the transition, which is also where the notification is sent.
    await emitWebhookEvent('certificate.issued', {
      user: await userRepository.findById(String(certificate.userId)),
      certificate,
    })
  },

  /**
   * Revokes one. The row stays — a revoked certificate is a fact about the
   * past, and deleting it would leave a QR code on somebody's wall pointing
   * at nothing rather than at "this was withdrawn".
   */
  async revoke(actor, certificateId, reason = '') {
    const certificate = await Certificate.findById(certificateId)
    if (!certificate || certificate.revokedAt) return certificate

    certificate.revokedAt = new Date()
    certificate.revokedBy = actor.id
    certificate.revokedReason = reason
    await certificate.save()

    await auditLogRepository.record({
      actor: actor.id,
      action: 'CERTIFICATE_REVOKED',
      entity: 'Certificate',
      entityId: certificate._id.toString(),
      metadata: { serial: certificate.serial, reason },
    })
    return certificate
  },

  /** Someone's own certificates, newest first. */
  async listForUser(userId) {
    return Certificate.find({ userId }).sort({ issuedAt: -1 }).lean()
  },

  /**
   * The admin list, fenced to whoever the caller may see (2.2).
   *
   * `scopedUserIds` is null for an unscoped caller and an allow-list
   * otherwise — the same contract every other listing uses, so a manager
   * cannot read certificates for a department they cannot read people for.
   */
  async list({ scopedUserIds = null, status = '', search = '', limit = 50, cursor = null } = {}) {
    const filter = {}
    if (scopedUserIds) filter.userId = { $in: scopedUserIds }
    if (status === 'REVOKED') filter.revokedAt = { $ne: null }
    if (status === 'VALID') {
      filter.revokedAt = null
      filter.$or = [{ validUntil: null }, { validUntil: { $gt: new Date() } }]
    }
    if (status === 'EXPIRED') {
      filter.revokedAt = null
      filter.validUntil = { $lte: new Date() }
    }
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'i')
      filter.$and = [{ $or: [{ fullName: regex }, { sourceTitle: regex }, { serial: regex }] }]
    }
    if (cursor) filter._id = { $lt: cursor }

    const rows = await Certificate.find(filter).sort({ _id: -1 }).limit(limit + 1).lean()
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, -1) : rows
    return { items, nextCursor: hasMore ? String(items.at(-1)._id) : null }
  },

  findBySerial(serial) {
    // Case-insensitive: the serial is typed off paper, and the alphabet is
    // upper-case only, so a lower-case entry is a person, not a miss.
    return Certificate.findOne({ serial: String(serial ?? '').trim().toUpperCase() })
  },

  /**
   * What the public verification page may say (AT-12 builds on this).
   *
   * Deliberately not the certificate row: no user id, no email, no course
   * id, nothing that could be walked back to a person beyond the name that
   * is printed on the paper the enquirer is already holding.
   */
  toPublicVerification(certificate, now = new Date()) {
    if (!certificate) return null
    const revoked = Boolean(certificate.revokedAt)
    const expired = Boolean(certificate.validUntil && certificate.validUntil < now)
    return {
      serial: certificate.serial,
      // The one piece of personal data here, and it is the piece already
      // printed on the paper the enquirer is holding. Everything that could
      // be walked back to an account — the user id, the course id, the pdf
      // key — is deliberately absent (AT-12).
      fullName: certificate.fullName,
      title: certificate.sourceTitle,
      issuedAt: certificate.issuedAt,
      validUntil: certificate.validUntil,
      // Revoked wins over expired: "we withdrew this" is a different answer
      // from "this ran out", and the stronger one is what a verifier needs.
      status: revoked ? 'REVOKED' : expired ? 'EXPIRED' : 'VALID',
      revokedAt: certificate.revokedAt ?? null,
    }
  },
}
