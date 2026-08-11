import { http } from './http'

export const videoAccessApi = {
  issueToken(videoId) {
    return http.post(`/video-access/${videoId}/token`).then((r) => r.data.data)
  },
}
