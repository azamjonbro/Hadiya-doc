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

  // How many people each course is assigned to — one aggregate for a page
  // of the library, keyed by course id as a string.
  async countByCourses(courseIds) {
    if (!courseIds.length) return {}
    const rows = await CourseAssignment.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ])
    return Object.fromEntries(rows.map((row) => [String(row._id), row.count]))
  },

  listByCourse(courseId) {
    return CourseAssignment.find({ courseId }).sort({ assignedAt: -1 })
  },

  listByUsersAndCourses(userIds, courseIds) {
    return CourseAssignment.find({ userId: { $in: userIds }, courseId: { $in: courseIds } })
  },

  create(data) {
    return CourseAssignment.create(data)
  },

  insertManyIgnoringDuplicates(rows) {
    // ordered:false so one already-enrolled user doesn't abort the rest of
    // the batch; the unique {userId, courseId} index is what makes the
    // whole operation safely repeatable. Only duplicate-key failures are
    // swallowed — anything else still has to surface.
    return CourseAssignment.insertMany(rows, { ordered: false }).catch((error) => {
      const writeErrors = error.writeErrors ?? (error.code === 11000 ? [error] : [])
      if (writeErrors.length && writeErrors.every((e) => (e.code ?? e.err?.code) === 11000)) {
        return error.insertedDocs ?? []
      }
      throw error
    })
  },

  // Only rows this group created — see the groupId comment on the model.
  deleteByGroup({ groupId, userIds, courseIds }) {
    const filter = { groupId }
    if (userIds) filter.userId = { $in: userIds }
    if (courseIds) filter.courseId = { $in: courseIds }
    return CourseAssignment.deleteMany(filter)
  },

  updateById(id, data) {
    return CourseAssignment.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  deleteById(id) {
    return CourseAssignment.findByIdAndDelete(id)
  },
}
