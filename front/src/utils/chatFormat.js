// Time and size formatting shared by every chat surface. Kept here rather
// than inside a component so the sidebar row, the message bubble and the
// info panel can never disagree about how the same instant is written.

export function formatClock(value, locale) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDayLabel(value, locale, t) {
  if (!value) return ''
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  if (sameDay(date, today)) return t('chat.time.today')
  if (sameDay(date, yesterday)) return t('chat.time.yesterday')

  const withinYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    ...(withinYear ? {} : { year: 'numeric' }),
  })
}

// Sidebar timestamps: a clock for today, a weekday inside the last week,
// a date beyond that — the pattern every messaging app converges on
// because the useful precision drops as the message gets older.
export function formatListTime(value, locale, t) {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return formatClock(value, locale)

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return t('chat.time.yesterday')

  const daysAgo = (now - date) / 86_400_000
  if (daysAgo < 7) return date.toLocaleDateString(locale, { weekday: 'short' })
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function formatRelative(value, locale, t) {
  if (!value) return ''
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return t('chat.time.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('chat.time.minutesAgo', { value: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('chat.time.hoursAgo', { value: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('chat.time.daysAgo', { value: days })
  return formatDateTime(value, locale)
}

export function formatBytes(bytes) {
  const value = Number(bytes ?? 0)
  if (!value) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let size = value
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds ?? 0))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

// "New employee" badge in the contact directory. Two weeks is long enough
// that a colleague hired last Monday is still flagged, short enough that
// the badge stays meaningful.
const NEW_JOINER_DAYS = 14

export function isNewJoiner(joinedAt) {
  if (!joinedAt) return false
  return (Date.now() - new Date(joinedAt).getTime()) / 86_400_000 < NEW_JOINER_DAYS
}
