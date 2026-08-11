import { CourseQuestion } from '../models/courseQuestion.model.js'

export const courseQuestionRepository = {
  create(data) {
    return CourseQuestion.create(data)
  },

  findById(id) {
    return CourseQuestion.findById(id)
  },

  listPage(courseId, { cursor, limit }) {
    const filter = { courseId }
    if (cursor) filter._id = { $lt: cursor }
    return CourseQuestion.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },

  addAnswer(questionId, { userId, answer }) {
    return CourseQuestion.findByIdAndUpdate(
      questionId,
      { $push: { answers: { userId, answer, createdAt: new Date() } } },
      { new: true, runValidators: true }
    )
  },

  deleteById(id) {
    return CourseQuestion.findByIdAndDelete(id)
  },
}
