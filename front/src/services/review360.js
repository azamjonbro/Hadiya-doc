import { http } from './http'

/**
 * 360° review (13.2).
 *
 * Three things about this module are worth knowing before calling it:
 *
 *  - raters are never sent from here. The server derives them from
 *    `managerId` at launch, so a cycle payload carries subjects only; the
 *    only way to see who will be asked is `raters()`, which computes the
 *    same list without creating anything.
 *  - `results()` is the whole report, anonymity gate already applied. The
 *    payload says per group whether it is `revealed`; a sealed group comes
 *    back with `average: null` on purpose. Never fill that in from other
 *    numbers on the page — the totals are built to make that impossible,
 *    and any client-side arithmetic would be undoing the gate.
 *  - `close()` returns the cycle with `competencyLevelsPosted` /
 *    `competencyLevelsSkipped` attached, because closing may also write
 *    levels into 13.1 and a partial write has to be visible to whoever
 *    pressed the button.
 */
export const review360Api = {
  /* -------- templates: the questionnaire a cycle is made of -------- */
  templates(params = {}) {
    return http.get('/review360/templates', { params }).then((r) => r.data.data.items)
  },
  template(id) {
    return http.get(`/review360/templates/${id}`).then((r) => r.data.data.template)
  },
  createTemplate(payload) {
    return http.post('/review360/templates', payload).then((r) => r.data.data.template)
  },
  updateTemplate(id, payload) {
    return http.patch(`/review360/templates/${id}`, payload).then((r) => r.data.data.template)
  },
  removeTemplate(id) {
    return http.delete(`/review360/templates/${id}`).then((r) => r.data.data)
  },

  /* -------- cycles -------- */
  cycles(params = {}) {
    return http.get('/review360/cycles', { params }).then((r) => r.data.data.items)
  },
  cycle(id) {
    return http.get(`/review360/cycles/${id}`).then((r) => r.data.data.cycle)
  },
  createCycle(payload) {
    return http.post('/review360/cycles', payload).then((r) => r.data.data.cycle)
  },
  updateCycle(id, payload) {
    return http.patch(`/review360/cycles/${id}`, payload).then((r) => r.data.data.cycle)
  },
  removeCycle(id) {
    return http.delete(`/review360/cycles/${id}`).then((r) => r.data.data)
  },

  // What launching would send, without sending it: { threshold, subjects[] }.
  raters(id) {
    return http.get(`/review360/cycles/${id}/raters`).then((r) => r.data.data)
  },
  launch(id) {
    return http.post(`/review360/cycles/${id}/launch`).then((r) => r.data.data.cycle)
  },
  close(id) {
    return http.post(`/review360/cycles/${id}/close`).then((r) => r.data.data.cycle)
  },
  // { cycle, invited, responded, subjects[] } — names are fine here, this is
  // who still has to be chased, not what anybody said.
  progress(id) {
    return http.get(`/review360/cycles/${id}/progress`).then((r) => r.data.data)
  },
  results(cycleId, subjectId) {
    return http.get(`/review360/cycles/${cycleId}/results/${subjectId}`).then((r) => r.data.data)
  },

  /* -------- the rater's own inbox -------- */
  mine(params = {}) {
    return http.get('/review360/mine', { params }).then((r) => r.data.data.items)
  },
  assignment(id) {
    return http.get(`/review360/assignments/${id}`).then((r) => r.data.data.assignment)
  },
  respond(id, payload) {
    return http.post(`/review360/assignments/${id}/respond`, payload).then((r) => r.data.data)
  },
}
