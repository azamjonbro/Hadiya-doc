import { Course } from '../models/course.model.js'

export const courseRepository = {
  findById(id) {
    return Course.findById(id)
  },

  findBySlug(slug) {
    return Course.findOne({ slug })
  },

  create(data) {
    return Course.create(data)
  },

  updateById(id, data) {
    return Course.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  archive(id) {
    return Course.findByIdAndUpdate(id, { $set: { status: 'ARCHIVED' } }, { new: true })
  },

  listPage({ search, status, cursor, limit }) {
    const filter = {}
    if (search) filter.title = new RegExp(search.trim(), 'i')
    if (status) filter.status = status
    if (cursor) filter._id = { $gt: cursor }

    return Course.find(filter)
      .sort({ _id: 1 })
      .limit(limit + 1)
  },
}
