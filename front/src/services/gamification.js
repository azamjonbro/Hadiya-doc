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
}
