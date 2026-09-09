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

  // Every video of several courses at once. Callers that hold a list of
  // course ids (an employee's assignments, a path's steps) used to map
  // listByCourse over it, which is one round trip per assigned course.
  listByCourses(courseIds) {
    if (!courseIds?.length) return Promise.resolve([])
    return Video.find({ courseId: { $in: courseIds } })
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
