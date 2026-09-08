import nodemailer from 'nodemailer'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { MailLog } from '../../models/mailLog.model.js'

/**
 * SMTP delivery, and the record of it.
 *
 * Deliberately thin: it takes an already-rendered subject and body and puts
 * it on the wire. Deciding *what* to say (template, language, whether this
 * user wants this type at all) belongs upstream — see 1.2 and 1.3 — and
 * mixing the two here is what makes mail systems impossible to test.
 *
 * Nodemailer over an SES/SendGrid SDK: the deployment is a single box in
 * Tashkent behind a Cloudflare tunnel, and its outbound mail goes through
 * whatever SMTP the company already has. A provider SDK would tie the code
 * to an account nobody has opened yet, while SMTP is what every provider —
 * including SES — also speaks.
 */

let transport = null

export function isMailConfigured() {
  return Boolean(env.SMTP_HOST && env.MAIL_FROM)
}

/**
 * Built once and reused: nodemailer pools connections, and a fresh
 * transport per message means a fresh TCP+TLS handshake per message, which
 * on a slow link is most of the cost of sending.
 */
export function getTransport() {
  if (!isMailConfigured()) return null
  if (transport) return transport
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Implicit TLS on 465; on 587 the connection starts plaintext and is
    // upgraded with STARTTLS, which nodemailer does automatically when the
    // server advertises it.
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    pool: true,
    maxConnections: 3,
  })
  return transport
}

// Tests and shutdown; a pooled transport holds sockets open.
export function closeTransport() {
  transport?.close()
  transport = null
}

export const mailService = {
  /**
   * Records the intent to send. Called when the job is enqueued, not when
   * it is attempted, so a message that never gets picked up at all still
   * leaves a trace instead of vanishing with the queue.
   */
  async createLog({ to, subject, templateKey = null, userId = null }) {
    return MailLog.create({ to, subject, templateKey, userId, status: 'QUEUED' })
  },

  /**
   * One attempt. Throws on failure so BullMQ can count it and retry —
   * swallowing the error here would turn five attempts into one silent
   * non-delivery.
   *
   * `attempt` is 1-based and comes from the job, not from a counter here,
   * so the row reflects what the queue actually did.
   */
  async send({ logId, to, subject, text, html, attempt = 1 }) {
    const mailer = getTransport()

    if (!mailer) {
      // No SMTP configured is a deployment state, not an error: the rest of
      // the platform must work on a laptop and on day one of an install.
      // SKIPPED rather than FAILED so it is not mistaken for a broken relay.
      logger.warn('Mail not sent — SMTP is not configured', { to, subject })
      if (logId) {
        await MailLog.findByIdAndUpdate(logId, { status: 'SKIPPED', attempts: attempt })
      }
      return { skipped: true }
    }

    try {
      const info = await mailer.sendMail({ from: env.MAIL_FROM, to, subject, text, html })
      if (logId) {
        await MailLog.findByIdAndUpdate(logId, {
          status: 'SENT',
          attempts: attempt,
          messageId: info.messageId ?? null,
          error: null,
          sentAt: new Date(),
        })
      }
      logger.info('Mail sent', { to, subject, attempt })
      return { messageId: info.messageId ?? null }
    } catch (error) {
      // The row is updated on every attempt, not only the last one, so a
      // message still being retried shows its attempt count while it climbs
      // rather than looking untouched until it finally gives up.
      if (logId) {
        await MailLog.findByIdAndUpdate(logId, {
          attempts: attempt,
          error: String(error.message ?? error).slice(0, 500),
        })
      }
      throw error
    }
  },

  /** Called once BullMQ has exhausted every attempt. */
  async markFailed({ logId, attempts, error }) {
    if (!logId) return
    await MailLog.findByIdAndUpdate(logId, {
      status: 'FAILED',
      attempts,
      error: String(error ?? '').slice(0, 500),
    })
  },
}
