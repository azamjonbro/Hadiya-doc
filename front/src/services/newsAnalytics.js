import { http } from './http'

export const newsAnalyticsApi = {
  getUserReport(newsId, userId) {
    return http.get(`/news-analytics/${newsId}/users/${userId}/report`).then((r) => r.data.data)
  },
}
