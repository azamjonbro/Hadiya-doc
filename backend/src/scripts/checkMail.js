/**
 * Proves that outbound mail actually leaves the box.
 *
 * `SMTP_HOST` empty means every send is recorded as SKIPPED and nothing is
 * wrong — until somebody expects a password-reset mail to arrive. Once a
 * provider account exists (INF-4) the failure modes move: wrong port for
 * the TLS mode, a relay that refuses the From: domain, a password with a
 * trailing space. None of those show up until a real message is attempted,
 * so this does exactly that, the same way the queue would.
 *
 *   npm --prefix backend run check:mail                    # handshake + auth only
 *   npm --prefix backend run check:mail -- --to you@x.uz   # and one real message
 *
 * Exits 0 when the relay accepted, 1 otherwise, so it can gate a deploy.
 */
import { env } from '../config/env.js'
import { isMailConfigured, getTransport, closeTransport } from '../services/notifications/mail.service.js'

const args = process.argv.slice(2)
const toIndex = args.indexOf('--to')
const to = toIndex >= 0 ? args[toIndex + 1] : null

async function main() {
  if (!isMailConfigured()) {
    console.log('SMTP_HOST or MAIL_FROM is empty — mail is not configured; every send is SKIPPED.')
    console.log('Fill SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, MAIL_FROM in backend/.env (see .env.example).')
    process.exit(1)
  }

  const secure = env.SMTP_SECURE ? 'implicit TLS' : 'STARTTLS if offered'
  console.log(`Relay: ${env.SMTP_HOST}:${env.SMTP_PORT} (${secure}), auth ${env.SMTP_USER ? 'as ' + env.SMTP_USER : 'none'}, From: ${env.MAIL_FROM}`)

  const transport = getTransport()
  try {
    await transport.verify()
    console.log('Handshake and authentication: OK')
  } catch (error) {
    console.error(`Handshake failed: ${error.message}`)
    process.exit(1)
  }

  if (!to) {
    console.log('No --to given; not sending a message. Pass --to <address> to prove delivery end to end.')
    return
  }

  try {
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to,
      subject: `Qo'llanma mail check ${new Date().toISOString()}`,
      text: 'If you are reading this, outbound mail from the LMS works.',
    })
    console.log(`Accepted by the relay for ${info.accepted.join(', ')} (id ${info.messageId})`)
    if (info.rejected?.length) {
      console.error(`Rejected: ${info.rejected.join(', ')}`)
      process.exit(1)
    }
  } catch (error) {
    console.error(`Send failed: ${error.message}`)
    process.exit(1)
  }
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => closeTransport())
