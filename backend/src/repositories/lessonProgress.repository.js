import { LessonProgress } from '../models/lessonProgress.model.js'

export const lessonProgressRepository = {
  findByUserAndLesson(userId, lessonId) {
    return LessonProgress.findOne({ userId, lessonId })
  },

  listByUserAndCourse(userId, courseId) {
    return LessonProgress.find({ userId, courseId })
  },

  // Course-wide, for the admin's per-employee view.
  listByCourse(courseId) {
    return LessonProgress.find({ courseId })
  },

  save(row) {
    return row.save()
  },

  create(data) {
    return LessonProgress.create(data)
  },
}
