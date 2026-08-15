import { Task } from '../models/task.model.js'

export const taskRepository = {
  findById(id) {
    return Task.findById(id)
  },

  create(data) {
    return Task.create(data)
  },

  createMany(docs) {
    return Task.insertMany(docs)
  },

  updateById(id, data) {
    return Task.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return Task.findByIdAndDelete(id)
  },

  listByAssignee({ assignedTo, status, cursor, limit }) {
    const filter = { assignedTo }
    if (status) filter.status = status
    if (cursor) filter._id = { $gt: cursor }
    return Task.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },

  // Unpaginated, for the per-employee task analytics — one person's task
  // history is small enough to summarise in a single pass, and a cursor
  // would only hide part of it from the averages.
  listAllByAssignee(assignedTo) {
    return Task.find({ assignedTo }).sort({ createdAt: -1 })
  },

  listByAssigner({ assignedBy, status, cursor, limit }) {
    const filter = { assignedBy }
    if (status) filter.status = status
    if (cursor) filter._id = { $gt: cursor }
    return Task.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },

  // --- Batch (fan-out) operations ---
  //
  // A position/company-wide assignment is many documents sharing one
  // batchId. The admin board draws them as a single card, so moving or
  // deleting that card has to reach every copy in one round trip rather
  // than one request per recipient.
  //
  // `fromStatus` narrows the batch to the copies currently in one board
  // column: a card in "To do" represents only the people who have not
  // started, and dragging it must not drag along the ones who already
  // finished.

  // The admin board is not paginated — it draws every column at once — so it
  // reads one capped page and groups fan-outs in the service. The cap is what
  // stops a company-wide assignment to a large org from turning one board
  // load into an unbounded scan.
  listBoardByAssigner({ assignedBy, limit = 2000 }) {
    return Task.find({ assignedBy }).sort({ createdAt: -1 }).limit(limit)
  },

  listByBatch({ batchId, assignedBy, fromStatus }) {
    const filter = { batchId }
    if (assignedBy) filter.assignedBy = assignedBy
    if (fromStatus) filter.status = fromStatus
    return Task.find(filter)
  },

  // The write half works off the ids listByBatch already returned rather
  // than re-deriving the filter. The service has to load those documents
  // anyway (to authorise, and to notify each assignee), and reusing the
  // exact set keeps the write from drifting from what was authorised.
  updateByIds(ids, data) {
    return Task.updateMany({ _id: { $in: ids } }, { $set: data }, { runValidators: true })
  },

  deleteByIds(ids) {
    return Task.deleteMany({ _id: { $in: ids } })
  },
}
