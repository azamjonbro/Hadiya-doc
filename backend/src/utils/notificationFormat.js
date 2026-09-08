import { env } from '../config/env.js'

/**
 * Values that go into notification placeholders.
 *
 * Kept out of the templates themselves: a template is text an admin can
 * edit, and "how a date is written" is not something that should be
 * retypeable per language in a text box — it is one rule, applied here.
 *
 * Everything formats in APP_TIMEZONE. `toLocaleDateString()` with no
 * arguments — what the call sites used before — formats in the *server's*
 * zone with the *server's* locale, so the same deadline read differently
 * depending on which machine sent the reminder.
 */

const LOCALE_BY_LANG = {
  uz: 'uz-UZ',
  ru: 'ru-RU',
  en: 'en-GB',
}

export function formatNotificationDate(date, lang = 'uz') {
  if (!date) return ''
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat(LOCALE_BY_LANG[lang] ?? LOCALE_BY_LANG.uz, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: env.APP_TIMEZONE,
  }).format(value)
}

export function formatNotificationDateTime(date, lang = 'uz') {
  if (!date) return ''
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat(LOCALE_BY_LANG[lang] ?? LOCALE_BY_LANG.uz, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: env.APP_TIMEZONE,
  }).format(value)
}

/**
 * Whole days from `now` to `date`, rounded up and floored at 0.
 *
 * Rounded up because "1 day left" has to keep saying 1 for the whole of that
 * last day — rounding down turns the final twenty-three hours into "0 days
 * left", which reads as already missed.
 */
export function daysUntil(date, now = new Date()) {
  if (!date) return ''
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return Math.max(0, Math.ceil((value.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
}
