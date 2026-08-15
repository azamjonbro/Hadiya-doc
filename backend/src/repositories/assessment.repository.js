import { Assessment } from '../models/assessment.model.js'

export const assessmentRepository = {
  findById(id) {
    return Assessment.findById(id)
  },

  findByIds(ids) {
    return Assessment.find({ _id: { $in: ids } })
  },

  listByTopic(topicId) {
    return Assessment.find({ topicId }).sort({ order: 1 })
  },

  create(data) {
    return Assessment.create(data)
  },

  updateById(id, data) {
    return Assessment.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return Assessment.findByIdAndDelete(id)
  },
}
