import { http } from './http'

// Sending `null` for a field is how the caller says "stop setting this and
// go back to the built-in default" — the API treats null as an unset, the
// same way the attention policy does.
export const facePolicyApi = {
  getGlobal() {
    return http.get('/face-policy').then((r) => r.data.data)
  },
  updateGlobal(payload) {
    return http.put('/face-policy', payload).then((r) => r.data.data)
  },
}
