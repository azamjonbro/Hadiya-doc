import { http } from './http'

export const orgApi = {
  // Portal §9, the gift button: { windowDays, upcoming: [...], past: [...] },
  // each row month/day only — the year is never sent.
  birthdays() {
    return http.get('/org/birthdays').then((r) => r.data.data)
  },
}
