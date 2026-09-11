import { CourseQuestion } from '../models/courseQuestion.model.js'

export const courseQuestionRepository = {
  // Questions per course, and how many still wait for an answer — the
  // admin Q&A page's course list (rasn 20), one aggregate.
  async summarize() {
    const rows = await CourseQuestion.aggregate([
      {
        $group: {
          _id: '$courseId',
          total: { $sum: 1 },
          unanswered: { $sum: { $cond: [{ $eq: [{ $size: '$answers' }, 0] }, 1, 0] } },
        },
      },
    ])
    return rows.map((row) => ({ courseId: String(row._id), total: row.total, unanswered: row.unanswered }))
  },

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
