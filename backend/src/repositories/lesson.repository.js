import { Lesson } from '../models/lesson.model.js'

export const lessonRepository = {
  findById(id) {
    return Lesson.findById(id)
  },

  listByTopic(topicId) {
    return Lesson.find({ topicId }).sort({ order: 1 })
  },

  listByCourse(courseId) {
    return Lesson.find({ courseId })
  },

  // Every lesson of several topics in one query — the reorder screen and the
  // curriculum both ask per course, never per topic in a loop (0.9).
  listByTopics(topicIds) {
    return Lesson.find({ topicId: { $in: topicIds } }).sort({ order: 1 })
  },

  create(data) {
    return Lesson.create(data)
  },

  updateById(id, data) {
    return Lesson.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return Lesson.findByIdAndDelete(id)
  },
}
