// Shared formatters for the employee analytics tabs. Durations arrive from
// the API in seconds (watch time) or hours (task turnaround); both need to
// read naturally at every magnitude, so "0 soat 4 daqiqa" never appears.

export function formatSeconds(seconds, t) {
  const total = Math.max(0, Math.round(seconds ?? 0))
  if (total < 60) return t('employee.units.seconds', { value: total })
  const minutes = Math.round(total / 60)
  if (minutes < 60) return t('employee.units.minutes', { value: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!rest) return t('employee.units.hours', { value: hours })
  return `${t('employee.units.hours', { value: hours })} ${t('employee.units.minutes', { value: rest })}`
}

export function formatHours(hours, t) {
  if (hours === null || hours === undefined) return '—'
  if (hours < 1) return t('employee.units.minutes', { value: Math.max(1, Math.round(hours * 60)) })
  if (hours < 48) return t('employee.units.hours', { value: Math.round(hours * 10) / 10 })
  return t('employee.units.days', { value: Math.round((hours / 24) * 10) / 10 })
}

// Month and weekday names for Uzbek come from utils/uzDateLocale.js, which
// fills the gap in the runtime at boot — these helpers are plain Intl.
export function formatDate(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Score bands mirror the backend's LEVEL_THRESHOLDS so the colour and the
// level label can never disagree.
export function scoreTone(score) {
  if (score === null || score === undefined) return 'neutral'
  if (score >= 85) return 'success'
  if (score >= 70) return 'primary'
  if (score >= 50) return 'warning'
  return 'danger'
}

/**
 * `<input type="date">` accepts exactly 'YYYY-MM-DD' and silently shows an
 * empty box for anything else — including the ISO timestamps the API returns.
 * Sliced rather than parsed on purpose: a birth date is a calendar day, and
 * running it through the local timezone is what turns the 1st into the 31st.
 */
export function toDateInputValue(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

// hh:mm:ss, the way a learning-history table lists time spent (portal §11):
// a fixed-width figure lines up in a column where "4 daqiqa" and
// "1 soat 12 daqiqa" would not.
export function formatHms(seconds) {
  const total = Math.max(0, Math.round(seconds ?? 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

/** "sentabr 2026" — a calendar's heading. */
export function formatMonthYear(date, locale) {
  return new Date(date).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

/** The seven column headings of a Monday-first calendar. */
export function weekdayNames(locale) {
  const monday = new Date(2024, 0, 1)
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getTime() + i * 86400e3).toLocaleDateString(locale, { weekday: 'short' }),
  )
}

/** "12 sen, 14:30" — a date with a time, as an event list writes it. */
export function formatWhen(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
