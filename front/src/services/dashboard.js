import { http } from './http'

export const dashboardApi = {
  get() {
    return http.get('/dashboard').then((r) => r.data.data)
  },
  // The same page for the people the caller answers for. Computed live per
  // request rather than read from the shared cache — a team is tens of
  // people and every manager wants a different answer.
  team() {
    return http.get('/dashboard/team').then((r) => r.data.data)
  },
  // What is waiting on somebody right now (questions, homework, new hires,
  // new material, comments). Live, unlike get().
  inbox() {
    return http.get('/dashboard/inbox').then((r) => r.data.data)
  },
}
