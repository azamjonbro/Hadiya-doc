import { MaterialProgress } from '../models/materialProgress.model.js'

export const materialProgressRepository = {
  findByUserAndMaterial(userId, materialId) {
    return MaterialProgress.findOne({ userId, materialId })
  },

  listByUserAndCourse(userId, courseId) {
    return MaterialProgress.find({ userId, courseId })
  },

  // Course-wide, for the admin's per-employee view.
  listByCourse(courseId) {
    return MaterialProgress.find({ courseId })
  },

  save(row) {
    return row.save()
  },

  create(data) {
    return MaterialProgress.create(data)
  },
}
