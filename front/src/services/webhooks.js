import { http } from './http'

export const webhooksApi = {
  list() {
    return http.get('/webhooks').then((r) => r.data.data)
  },

  events() {
    return http.get('/webhooks/events').then((r) => r.data.data)
  },

  // The response is the only time the signing secret is returned — after
  // this the platform will only ever sign with it, never show it.
  create(payload) {
    return http.post('/webhooks', payload).then((r) => r.data.data)
  },

  update(id, payload) {
    return http.patch(`/webhooks/${id}`, payload).then((r) => r.data.data)
  },

  rotateSecret(id) {
    return http.post(`/webhooks/${id}/rotate-secret`).then((r) => r.data.data)
  },

  ping(id) {
    return http.post(`/webhooks/${id}/ping`).then((r) => r.data.data)
  },

  remove(id) {
    return http.delete(`/webhooks/${id}`).then((r) => r.data.data)
  },

  deliveries(params = {}) {
    return http.get('/webhooks/deliveries', { params }).then((r) => r.data.data)
  },

  replay(deliveryId) {
    return http.post(`/webhooks/deliveries/${deliveryId}/replay`).then((r) => r.data.data)
  },
}
