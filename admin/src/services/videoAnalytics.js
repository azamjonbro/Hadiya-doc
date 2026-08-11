import { http } from './http'

export const videoAnalyticsApi = {
  getUserReport(videoId, userId) {
    return http.get(`/video-analytics/${videoId}/users/${userId}/report`).then((r) => r.data.data)
  },
}
