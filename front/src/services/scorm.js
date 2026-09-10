import { http } from './http'
import { API_BASE_URL } from './apiBase'

export const scormApi = {
  listByTopic(topicId) {
    return http.get(`/topics/${topicId}/scorm`).then((r) => r.data.data)
  },

  getById(id) {
    return http.get(`/scorm/${id}`).then((r) => r.data.data)
  },

  upload(topicId, { file, title, required }, onUploadProgress) {
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    if (required !== undefined) formData.append('required', String(required))
    return http.post(`/topics/${topicId}/scorm`, formData, { onUploadProgress }).then((r) => r.data.data)
  },

  update(id, payload) {
    return http.patch(`/scorm/${id}`, payload).then((r) => r.data.data)
  },

  remove(id) {
    return http.delete(`/scorm/${id}`).then((r) => r.data.data)
  },

  // For a package whose extraction failed: the archive is still stored, so
  // the unpacking can be tried again without a 300 MB re-upload.
  reprocess(id) {
    return http.post(`/scorm/${id}/reprocess`).then((r) => r.data.data)
  },

  progress(id) {
    return http.get(`/scorm/${id}/progress`).then((r) => r.data.data)
  },

  /**
   * Where to point the iframe.
   *
   * The API returns a path, not a URL, and it is joined to the configured
   * API base here. Building it on the server from request headers is what
   * broke the video upload in production: the tunnel in front of nginx
   * reports `http` for an `https` request, so a server-built absolute URL
   * comes back as mixed content the browser refuses (fe0e315).
   */
  async launch(id) {
    const launch = await http.get(`/scorm/${id}/launch`).then((r) => r.data.data)
    return { ...launch, playerUrl: `${API_BASE_URL}${launch.playerPath}` }
  },
}
