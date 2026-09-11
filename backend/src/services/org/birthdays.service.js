import { userRepository } from '../../repositories/user.repository.js'

/**
 * The gift button's panel (portal §9): colleagues whose birthday is in the
 * next month, and the ones from the past month. Computed on the calendar
 * day, in UTC, from `birthDate` — no stored "next birthday" to drift.
 *
 * The year is left out of the answer on purpose: a birthday is a company
 * occasion, an age is not.
 */
const WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function utcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

// This year's occurrence of a birthday, or the nearest one to `today` when
// the window straddles New Year. 29 February lands on 1 March in a common
// year, which is when those people celebrate.
function occurrence(birthDate, today) {
  const year = new Date(today).getUTCFullYear()
  const candidates = [year - 1, year, year + 1].map((y) =>
    Date.UTC(y, birthDate.getUTCMonth(), birthDate.getUTCDate())
  )
  return candidates.reduce((best, ts) => (Math.abs(ts - today) < Math.abs(best - today) ? ts : best))
}

export const birthdaysService = {
  async around(now = new Date()) {
    const today = utcDay(now)
    const rows = await userRepository.listActiveWithBirthdays()
    const upcoming = []
    const past = []
    for (const row of rows) {
      const at = occurrence(row.birthDate, today)
      const offset = Math.round((at - today) / DAY_MS)
      if (offset < -WINDOW_DAYS || offset > WINDOW_DAYS) continue
      const entry = {
        id: String(row._id),
        fullName: row.fullName,
        avatar: row.avatar ?? '',
        department: row.department ?? '',
        position: row.position ?? '',
        // Month and day only — see the note above.
        month: row.birthDate.getUTCMonth() + 1,
        day: row.birthDate.getUTCDate(),
        daysUntil: offset,
      }
      ;(offset >= 0 ? upcoming : past).push(entry)
    }
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil || a.fullName.localeCompare(b.fullName))
    past.sort((a, b) => b.daysUntil - a.daysUntil || a.fullName.localeCompare(b.fullName))
    return { windowDays: WINDOW_DAYS, upcoming, past }
  },
}
