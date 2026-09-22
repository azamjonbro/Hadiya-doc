import { env } from '../../config/env.js'
import { ApiKey } from '../../models/apiKey.model.js'
import { Webhook } from '../../models/webhook.model.js'

/**
 * What this installation is actually wired to (the reference's «Сервисы»
 * page, honestly answered).
 *
 * Every row says one of three things: `on` — configured and usable, `off`
 * — the code is here and the keys are not, `none` — nothing to configure.
 * The keys themselves never leave the server; only whether they are set,
 * and where a person would go to change them. Several are server-side
 * (`.env`), which the row says rather than offering a switch that could
 * not work.
 */
export const integrationStatusService = {
  async list() {
    const [apiKeys, webhooks] = await Promise.all([
      ApiKey.countDocuments({ revokedAt: null }),
      Webhook.countDocuments({ active: true }),
    ])

    const row = (key, on, { detail = '', where = 'env', link = '' } = {}) => ({ key, status: on ? 'on' : 'off', detail, where, link })

    return [
      row('sso', Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET), {
        detail: env.OIDC_ISSUER,
        link: '/bos/settings',
      }),
      row('mail', Boolean(env.SMTP_HOST && env.MAIL_FROM), { detail: env.SMTP_HOST }),
      row('push', Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)),
      row('ai', Boolean(env.ANTHROPIC_API_KEY), { link: '/bos/ai' }),
      row('storage', Boolean(env.S3_ENDPOINT), { detail: env.S3_ENDPOINT }),
      row('api', apiKeys > 0, { detail: String(apiKeys), where: 'app', link: '/bos/settings' }),
      row('webhooks', webhooks > 0, { detail: String(webhooks), where: 'app', link: '/bos/settings' }),
      // Meetings are per event: a link or a Zoom/Teams/Meet id on the event
      // itself, so there is nothing account-wide to switch on.
      { key: 'meetings', status: 'none', detail: '', where: 'app', link: '/bos/events' },
    ]
  },
}
