import { Topic } from '../models/topic.model.js'

export const topicRepository = {
  findById(id) {
    return Topic.findById(id)
  },

  findByCourseAndSlug(courseId, slug) {
    return Topic.findOne({ courseId, slug })
  },

  listByCourse(courseId) {
    return Topic.find({ courseId }).sort({ order: 1 })
  },

  create(data) {
    return Topic.create(data)
  },

  updateById(id, data) {
    return Topic.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return Topic.findByIdAndDelete(id)
  },

  countByCourse(courseId) {
    return Topic.countDocuments({ courseId })
  },
}
