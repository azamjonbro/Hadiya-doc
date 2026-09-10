import { http } from './http'

export const videosApi = {
  listByTopic(topicId) {
    return http.get(`/topics/${topicId}/videos`).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/videos/${id}`).then((r) => r.data.data)
  },
  getStatus(id) {
    return http.get(`/videos/${id}/status`).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/videos/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/videos/${id}`).then((r) => r.data.data)
  },

  // --- Caption tracks (9.4) ---
  //
  // The list also rides on the video payload; this is for the admin panel,
  // which needs it after every change without re-reading the whole video.
  listSubtitles(id) {
    return http.get(`/videos/${id}/subtitles`).then((r) => r.data.data)
  },

  addSubtitle(id, { file, lang, label, isDefault }) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('lang', lang)
    if (label) formData.append('label', label)
    if (isDefault !== undefined) formData.append('isDefault', String(isDefault))
    return http.post(`/videos/${id}/subtitles`, formData).then((r) => r.data.data)
  },

  setDefaultSubtitle(id, trackId) {
    return http.patch(`/videos/${id}/subtitles/${trackId}/default`).then((r) => r.data.data)
  },

  removeSubtitle(id, trackId) {
    return http.delete(`/videos/${id}/subtitles/${trackId}`).then((r) => r.data.data)
  },
}
