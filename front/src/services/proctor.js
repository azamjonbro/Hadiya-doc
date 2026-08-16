import { http } from './http'

export const proctorApi = {
  // Multipart because it carries an image. Fire-and-forget from the player's
  // point of view: a failed upload must never interrupt the lesson.
  captureSnapshot(videoId, { blob, reason, sessionId, position, faceCount }) {
    const form = new FormData()
    form.append('snapshot', blob, 'snapshot.jpg')
    form.append('reason', reason)
    form.append('sessionId', sessionId)
    if (position !== null && position !== undefined) form.append('position', String(position))
    if (faceCount !== null && faceCount !== undefined) form.append('faceCount', String(faceCount))
    return http.post(`/proctor/videos/${videoId}/snapshots`, form).then((r) => r.data.data)
  },

  list(params) {
    return http.get('/proctor/snapshots', { params }).then((r) => r.data.data)
  },

  // The image is streamed by the API behind an admin permission — there is no
  // public URL to put in an <img src>, so it is fetched as a blob and shown
  // from an object URL.
  async imageObjectUrl(id) {
    const r = await http.get(`/proctor/snapshots/${id}/image`, { responseType: 'blob' })
    return URL.createObjectURL(r.data)
  },

  markReviewed(id) {
    return http.patch(`/proctor/snapshots/${id}/reviewed`).then((r) => r.data.data)
  },
}
