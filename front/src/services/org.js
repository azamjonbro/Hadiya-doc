import { http } from './http'

export const orgApi = {
  // Portal §9, the gift button: { windowDays, upcoming: [...], past: [...] },
  // each row month/day only — the year is never sent.
  birthdays() {
    return http.get('/org/birthdays').then((r) => r.data.data)
  },
  // Portal §8. `newOnly` narrows to the last 30 days by hire date.
  directory(params) {
    return http.get('/org/directory', { params }).then((r) => r.data.data)
  },
  // { total, branches: [{ name, count, departments: [{ name, count, subdivisions }] }] }
  structure() {
    return http.get('/org/structure').then((r) => r.data.data)
  },
}
