import { CourseAssignment } from '../models/courseAssignment.model.js'

export const courseAssignmentRepository = {
  findById(id) {
    return CourseAssignment.findById(id)
  },

  findByUserAndCourse(userId, courseId) {
    return CourseAssignment.findOne({ userId, courseId })
  },

  listByUser(userId) {
    return CourseAssignment.find({ userId }).sort({ assignedAt: -1 })
  },

  listByCourse(courseId) {
    return CourseAssignment.find({ courseId }).sort({ assignedAt: -1 })
  },

  create(data) {
    return CourseAssignment.create(data)
  },

  updateById(id, data) {
    return CourseAssignment.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return CourseAssignment.findByIdAndDelete(id)
  },
}
