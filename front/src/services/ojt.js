import { http } from './http'

/**
 * On-the-job training (13.3).
 *
 * `recordObservation` is a PUT and takes a stable per-item URL on purpose:
 * it is the one call in this module made on a shop floor with no signal,
 * and the server upserts on (session, item). That is what lets the offline
 * queue (12.3) replay it without any risk of counting a verdict twice —
 * see OjtObservationView.vue for the queueing itself.
 */
export const ojtApi = {
  checklists(params = {}) {
    return http.get('/ojt/checklists', { params }).then((r) => r.data.data.items)
  },
  checklist(id) {
    return http.get(`/ojt/checklists/${id}`).then((r) => r.data.data.checklist)
  },
  createChecklist(payload) {
    return http.post('/ojt/checklists', payload).then((r) => r.data.data.checklist)
  },
  updateChecklist(id, payload) {
    return http.patch(`/ojt/checklists/${id}`, payload).then((r) => r.data.data.checklist)
  },
  removeChecklist(id) {
    return http.delete(`/ojt/checklists/${id}`).then((r) => r.data.data)
  },

  sessions(params = {}) {
    return http.get('/ojt/sessions', { params }).then((r) => r.data.data)
  },
  session(id) {
    return http.get(`/ojt/sessions/${id}`).then((r) => r.data.data.session)
  },
  createSession(payload) {
    return http.post('/ojt/sessions', payload).then((r) => r.data.data.session)
  },
  startSession(id) {
    return http.post(`/ojt/sessions/${id}/start`).then((r) => r.data.data.session)
  },
  // The path the offline queue replays verbatim. Kept as a builder so the
  // view and the queue entry cannot drift apart.
  observationPath(sessionId, itemId) {
    return `/ojt/sessions/${sessionId}/observations/${itemId}`
  },
  recordObservation(sessionId, itemId, payload) {
    return http.put(this.observationPath(sessionId, itemId), payload).then((r) => r.data.data)
  },
  completeSession(id, payload = {}) {
    return http.post(`/ojt/sessions/${id}/complete`, payload).then((r) => r.data.data.session)
  },
  signOff(id, payload = {}) {
    return http.post(`/ojt/sessions/${id}/sign-off`, payload).then((r) => r.data.data.session)
  },
  cancelSession(id, payload = {}) {
    return http.post(`/ojt/sessions/${id}/cancel`, payload).then((r) => r.data.data.session)
  },
}
