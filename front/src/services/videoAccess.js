import { http } from './http'

export const videoAccessApi = {
  // `renewToken` is the token the player already holds. Sent only by the
  // refresh loop, where it is what tells the API this is a lesson already in
  // progress rather than one being opened — see videoAccess.service.js.
  issueToken(videoId, renewToken = '') {
    const body = renewToken ? { renewToken } : undefined
    return http.post(`/video-access/${videoId}/token`, body).then((r) => r.data.data)
  },
}
