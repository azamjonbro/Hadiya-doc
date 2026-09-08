import { News } from '../models/news.model.js'
import { containsRegex } from '../utils/escapeRegex.js'

export const newsRepository = {
  findById(id) {
    return News.findOne({ _id: id, deletedAt: null })
  },

  findAnyById(id) {
    return News.findById(id)
  },

  listTrashed() {
    return News.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).limit(200)
  },

  softDelete(id, actorId) {
    return News.findByIdAndUpdate(id, { $set: { deletedAt: new Date(), deletedBy: actorId } }, { new: true })
  },

  restore(id) {
    return News.findByIdAndUpdate(id, { $set: { deletedAt: null, deletedBy: null } }, { new: true })
  },

  deleteExpired(before) {
    return News.deleteMany({ deletedAt: { $ne: null, $lte: before } })
  },

  create(data) {
    return News.create(data)
  },

  updateById(id, data) {
    return News.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return News.findByIdAndDelete(id)
  },

  listPage({ search, status, cursor, limit }) {
    const filter = { deletedAt: null }
    if (search) filter.title = containsRegex(search)
    if (status) filter.status = status
    if (cursor) filter._id = { $gt: cursor }

    return News.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },

  feedPage({ department, role, cursor, limit }) {
    const now = new Date()
    const filter = {
      status: 'PUBLISHED',
      deletedAt: null,
      publishAt: { $lte: now },
      $and: [
        { $or: [{ expiryAt: null }, { expiryAt: { $gte: now } }] },
        { $or: [{ departmentTargets: { $size: 0 } }, { departmentTargets: department }] },
        { $or: [{ roleTargets: { $size: 0 } }, { roleTargets: role }] },
      ],
    }
    if (cursor) filter._id = { $lt: cursor }

    return News.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },
}
