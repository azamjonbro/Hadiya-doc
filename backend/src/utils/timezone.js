// "Same calendar day" in the configured org timezone (env.APP_TIMEZONE) —
// no date library needed. Intl.DateTimeFormat already knows every IANA
// zone's offset including DST; a fixed-offset subtraction would get that
// wrong twice a year.
const formatterCache = new Map()

function formatterFor(timezone) {
  let formatter = formatterCache.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatterCache.set(timezone, formatter)
  }
  return formatter
}

export function localDateKey(date, timezone) {
  return formatterFor(timezone).format(date)
}

export function isSameLocalDay(a, b, timezone) {
  if (!a || !b) return false
  return localDateKey(a, timezone) === localDateKey(b, timezone)
}
