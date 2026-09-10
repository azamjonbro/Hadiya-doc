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

/**
 * How far ahead of UTC the zone is at this instant, in milliseconds.
 *
 * Read out of Intl rather than stored: a fixed offset is wrong twice a year
 * in any zone with DST, and "we do not have DST here" is a fact about one
 * deployment, not about the code.
 */
function offsetMs(date, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  )
  // What the wall clock there reads, read back as if it were UTC. The gap
  // between that and the real instant is the offset.
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  )
  return asIfUtc - date.getTime()
}

/**
 * The instant at which the wall clock in `timezone` reads the given local
 * date and hour.
 *
 * Two passes: the first guess treats the wall time as UTC, which is wrong by
 * the offset; the second re-reads the offset *at that corrected instant*,
 * which is what makes it right on the days the offset changes.
 */
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timezone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const firstPass = new Date(guess - offsetMs(new Date(guess), timezone))
  return new Date(guess - offsetMs(firstPass, timezone))
}

/** Year, month (1-12), day and weekday (0 = Sunday) as read in `timezone`. */
export function zonedDateParts(date, timezone) {
  const [year, month, day] = localDateKey(date, timezone).split('-').map(Number)
  // Built from the parts rather than from `date`, so the weekday is the one
  // that zone is having and not the server's.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return { year, month, day, weekday }
}
