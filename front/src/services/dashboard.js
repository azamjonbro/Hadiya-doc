import { http } from './http'

export const dashboardApi = {
  get() {
    return http.get('/dashboard').then((r) => r.data.data)
  },
}
