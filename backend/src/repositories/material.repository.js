import { Material } from '../models/material.model.js'

export const materialRepository = {
  findById(id) {
    return Material.findById(id)
  },

  listByTopic(topicId) {
    return Material.find({ topicId }).sort({ order: 1 })
  },

  listByCourse(courseId) {
    return Material.find({ courseId })
  },

  create(data) {
    return Material.create(data)
  },

  updateById(id, data) {
    return Material.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return Material.findByIdAndDelete(id)
  },
}
