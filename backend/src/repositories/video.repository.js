import { Video } from '../models/video.model.js'

export const videoRepository = {
  findById(id) {
    return Video.findById(id)
  },

  listByTopic(topicId) {
    return Video.find({ topicId }).sort({ order: 1 })
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
