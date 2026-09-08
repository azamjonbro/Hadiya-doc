import {
  NotificationTemplate,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LANGS,
  DEFAULT_LANG,
} from '../../models/notificationTemplate.model.js'
import { logger } from '../../config/logger.js'

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g

// A short in-process cache: every notification render hits this, templates
// change perhaps twice a year, and a per-notification database round trip
// for text that never moves is pure latency. Cleared on write, so an edit in
// the admin UI is visible immediately on the process that made it and within
// a minute everywhere else.
const CACHE_TTL_MS = 60_000
const cache = new Map()

function cacheKey(type, channel, lang) {
  return `${type}|${channel}|${lang}`
}

export function clearTemplateCache() {
  cache.clear()
}

/** Placeholders actually written in a piece of text. */
export function extractPlaceholders(text) {
  const found = new Set()
  for (const match of String(text ?? '').matchAll(PLACEHOLDER_RE)) {
    found.add(match[1])
  }
  return [...found]
}

/**
 * Substitutes `{{name}}` from `vars`, refusing anything not on the
 * allowlist.
 *
 * Templates are editable by admins, and `vars` is whatever the calling
 * domain service happened to pass — often a Mongoose document. Without the
 * allowlist, someone who can edit a template could render `{{passwordHash}}`
 * into an email. The allowlist is per template and comes from the seed, so
 * the set of readable fields is decided in code, not in a text box.
 *
 * A placeholder that is allowed but has no value renders as an empty string
 * rather than staying literal — "Due {{deadline}}" reaching an employee is
 * worse than "Due ".
 */
export function render(text, vars = {}, allowed = [], defaults = {}) {
  const allowlist = new Set(allowed)
  const rejected = new Set()
  // Mongoose hands back a Map for a Map-typed field, a plain object once the
  // document has been through .lean() in some paths — accept either.
  const fallback = (name) =>
    defaults instanceof Map ? defaults.get(name) : defaults?.[name]

  const out = String(text ?? '').replace(PLACEHOLDER_RE, (_full, name) => {
    if (!allowlist.has(name)) {
      rejected.add(name)
      return ''
    }
    const value = vars[name]
    if (value === undefined || value === null || value === '') {
      return fallback(name) ?? ''
    }
    return String(value)
  })

  return { text: out.replace(/\s{2,}/g, ' ').trim(), rejected: [...rejected] }
}

export const notificationTemplateService = {
  /**
   * The stored template for a type/channel, in the closest language we have.
   *
   * Falls back to Uzbek rather than English: this is an Uzbek company, and a
   * missing Russian translation should land on the language everyone reads.
   * Returns null when the type is unknown or the row is disabled — callers
   * treat that as "do not send on this channel", which is what `enabled`
   * exists for.
   */
  async find({ type, channel, lang = DEFAULT_LANG }) {
    if (!NOTIFICATION_CHANNELS.includes(channel)) {
      throw new Error(`Unknown notification channel: ${channel}`)
    }
    const wanted = NOTIFICATION_LANGS.includes(lang) ? lang : DEFAULT_LANG

    for (const candidate of wanted === DEFAULT_LANG ? [wanted] : [wanted, DEFAULT_LANG]) {
      const key = cacheKey(type, channel, candidate)
      const hit = cache.get(key)
      if (hit && hit.expires > Date.now()) {
        if (hit.template) return hit.template
        continue
      }

      const template = await NotificationTemplate.findOne({ type, channel, lang: candidate }).lean()
      cache.set(key, { template: template ?? null, expires: Date.now() + CACHE_TTL_MS })
      if (template) return template
    }
    return null
  },

  /**
   * Renders one notification. Returns null when there is nothing to send —
   * no template, or the row is disabled.
   *
   * Rejected placeholders are logged rather than thrown: a typo in one
   * template must not take down the notification, and the log names the
   * template so it can be fixed.
   */
  async render({ type, channel, lang = DEFAULT_LANG, vars = {} }) {
    const template = await this.find({ type, channel, lang })
    if (!template || !template.enabled) return null

    const subject = render(template.subject, vars, template.placeholders, template.defaults)
    const body = render(template.body, vars, template.placeholders, template.defaults)
    const rejected = [...new Set([...subject.rejected, ...body.rejected])]

    if (rejected.length) {
      logger.warn('Notification template used placeholders that are not allowed', {
        type,
        channel,
        lang: template.lang,
        rejected,
      })
    }

    return { subject: subject.text, body: body.text, lang: template.lang, rejected }
  },

  /**
   * Admin edit. Marks the row customized so a later re-run of the M9 seed
   * leaves it alone, and drops the cache so the change is visible at once.
   */
  async update({ type, channel, lang, subject, body, enabled }) {
    const updated = await NotificationTemplate.findOneAndUpdate(
      { type, channel, lang },
      {
        ...(subject === undefined ? {} : { subject }),
        ...(body === undefined ? {} : { body }),
        ...(enabled === undefined ? {} : { enabled }),
        customized: true,
      },
      { new: true }
    ).lean()
    clearTemplateCache()
    return updated
  },
}
