import { http } from './http'

export const eventsApi = {
  calendar(params) {
    return http.get('/events/calendar', { params }).then((r) => r.data.data)
  },
  getById(id) {
    return http.get(`/events/${id}`).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/events', payload).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/events/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/events/${id}`).then((r) => r.data.data)
  },

  // Taking a seat, or a place in the queue — the server decides which.
  register(id) {
    return http.post(`/events/${id}/register`).then((r) => r.data.data)
  },
  cancelRegistration(id, userId) {
    return http.post(`/events/${id}/cancel-registration`, userId ? { userId } : {}).then((r) => r.data.data)
  },

  registrations(id) {
    return http.get(`/events/${id}/registrations`).then((r) => r.data.data.items)
  },
  markAttendance(id, entries) {
    return http.post(`/events/${id}/attendance`, { entries }).then((r) => r.data.data)
  },
}
