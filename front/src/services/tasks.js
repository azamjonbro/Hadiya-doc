import { http } from './http'

export const tasksApi = {
  listMy(params) {
    return http.get('/tasks/my', { params }).then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/tasks/${id}`, payload).then((r) => r.data.data)
  },

  listAssignedByMe(params) {
    return http.get('/tasks/assigned-by-me', { params }).then((r) => r.data.data)
  },
  // The kanban feed: every copy of every task this admin assigned, uncapped by
  // a cursor so the columns and the per-card recipient tallies are complete.
  // The board groups fan-outs into one card per batch itself, and needs the
  // individual rows to show who inside a group is done.
  listBoard() {
    return http.get('/tasks/board').then((r) => r.data.data)
  },
  // Moving or deleting a fan-out card reaches every copy in one request.
  // `fromStatus` is the column the card was dragged out of, so only the copies
  // that were actually in it move.
  updateBatch(batchId, payload) {
    return http.patch(`/tasks/batch/${batchId}`, payload).then((r) => r.data.data)
  },
  removeBatch(batchId, params) {
    return http.delete(`/tasks/batch/${batchId}`, { params }).then((r) => r.data.data)
  },
  create(payload) {
    return http.post('/tasks', payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/tasks/${id}`).then((r) => r.data.data)
  },
}
