import { News } from '../models/news.model.js'

export const newsRepository = {
  findById(id) {
    return News.findById(id)
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
    const filter = {}
    if (search) filter.title = new RegExp(search.trim(), 'i')
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
