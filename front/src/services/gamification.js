import { http } from './http'

export const gamificationApi = {
  getMySummary() {
    return http.get('/gamification/me').then((r) => r.data.data)
  },
  // The endpoint returns { period, totalRanked, rows } — this view only
  // renders the ranking itself.
  getLeaderboard() {
    return http.get('/gamification/leaderboard').then((r) => r.data.data.rows)
  },

  // Returns { period, totalRanked, rows }. The group/department/includeZero
  // filters are only honoured for actors holding analytics:view:all — the
  // API silently falls back to the plain company board otherwise.
  leaderboard(params) {
    return http.get('/gamification/leaderboard', { params }).then((r) => r.data.data)
  },
}
