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
