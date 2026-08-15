import { Video } from '../models/video.model.js'

export const videoRepository = {
  findById(id) {
    return Video.findById(id)
  },

  findByIds(ids) {
    return Video.find({ _id: { $in: ids } })
  },

  listByTopic(topicId) {
    return Video.find({ topicId }).sort({ order: 1 })
  },

  listByCourse(courseId) {
    return Video.find({ courseId })
  },

  create(data) {
    return Video.create(data)
  },

  updateById(id, data) {
    return Video.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return Video.findByIdAndDelete(id)
  },
}
