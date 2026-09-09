import axios from 'axios'
import { http } from './http'
import { API_BASE_URL } from './apiBase'

export const certificatesApi = {
  mine() {
    return http.get('/certificates/mine').then((r) => r.data.data.items)
  },

  list(params = {}) {
    return http.get('/certificates', { params }).then((r) => r.data.data)
  },

  /**
   * Asks for a signed URL and follows it, rather than streaming the PDF
   * through the API. The bytes come straight from storage, so a large
   * certificate does not occupy an API connection for its download.
   */
  async download(id) {
    const { url } = await http.get(`/certificates/${id}/download`).then((r) => r.data.data)
    window.open(url, '_blank', 'noopener')
  },

  revoke(id, reason) {
    return http.post(`/certificates/${id}/revoke`, { reason }).then((r) => r.data.data.certificate)
  },

  templates() {
    return http.get('/certificates/templates').then((r) => r.data.data.items)
  },

  createTemplate(payload) {
    return http.post('/certificates/templates', payload).then((r) => r.data.data.template)
  },

  updateTemplate(id, payload) {
    return http.patch(`/certificates/templates/${id}`, payload).then((r) => r.data.data.template)
  },

  deleteTemplate(id) {
    return http.delete(`/certificates/templates/${id}`)
  },

  /**
   * The public check, on a bare axios call rather than `http`.
   *
   * `http` attaches the access token and, on a 401, tries to refresh and
   * then bounces to the login page. None of that belongs on a page whose
   * whole point is that the visitor has no account — a signed-in admin
   * checking a serial would work either way, but a stranger with a printout
   * would get redirected to a login screen.
   */
  verify(serial) {
    return axios
      .get(`${API_BASE_URL}/public/certificates/${encodeURIComponent(serial)}`)
      .then((r) => r.data.data.certificate)
  },
}
