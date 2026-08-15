import { http } from './http'

export const gamificationApi = {
  // Returns { period, totalRanked, rows }. The group/department/includeZero
  // filters are only honoured for actors holding analytics:view:all — the
  // API silently falls back to the plain company board otherwise.
  leaderboard(params) {
    return http.get('/gamification/leaderboard', { params }).then((r) => r.data.data)
  },
}
