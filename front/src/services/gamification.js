import { http } from './http'

export const gamificationApi = {
  getMySummary() {
    return http.get('/gamification/me').then((r) => r.data.data)
  },
  // { items: [{ points, source, courseTitle, itemTitle, earnedAt }] }, newest first.
  getMyPoints() {
    return http.get('/gamification/me/points').then((r) => r.data.data)
  },
  getMyBadges() {
    return http.get('/gamification/badges').then((r) => r.data.data)
  },
  getBadgeCatalog() {
    return http.get('/gamification/badges/catalog').then((r) => r.data.data)
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
