import { http } from './http'

export const eventsApi = {
  calendar(params) {
    return http.get('/events/calendar', { params }).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/events', payload).then((r) => r.data.data)
  },
}
