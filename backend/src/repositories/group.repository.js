import { Group } from '../models/group.model.js'

export const groupRepository = {
  findById(id) {
    return Group.findById(id)
  },

  findByIds(ids) {
    return Group.find({ _id: { $in: ids } })
  },

  listAll({ search, department } = {}) {
    const filter = {}
    if (search) filter.name = new RegExp(search.trim(), 'i')
    if (department) filter.department = department
    return Group.find(filter).sort({ name: 1 })
  },

  listByMember(userId) {
    return Group.find({ memberIds: userId }).sort({ name: 1 })
  },

  create(data) {
    return Group.create(data)
  },

  updateById(id, data) {
    return Group.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  // $addToSet, not $push — re-adding an employee who is already a member is
  // a no-op instead of a duplicate row in the array.
  addMembers(id, userIds, updatedBy) {
    return Group.findByIdAndUpdate(
      id,
      { $addToSet: { memberIds: { $each: userIds } }, $set: { updatedBy } },
      { new: true }
    )
  },

  removeMember(id, userId, updatedBy) {
    return Group.findByIdAndUpdate(id, { $pull: { memberIds: userId }, $set: { updatedBy } }, { new: true })
  },

  // The counterpart to addMembers' $addToSet: a whole selection leaves in one
  // write, so a bulk removal cannot strand half the roster.
  removeMembers(id, userIds, updatedBy) {
    return Group.findByIdAndUpdate(
      id,
      { $pull: { memberIds: { $in: userIds } }, $set: { updatedBy } },
      { new: true }
    )
  },

  addCourses(id, courseIds, updatedBy) {
    return Group.findByIdAndUpdate(
      id,
      { $addToSet: { courseIds: { $each: courseIds } }, $set: { updatedBy } },
      { new: true }
    )
  },

  removeCourse(id, courseId, updatedBy) {
    return Group.findByIdAndUpdate(id, { $pull: { courseIds: courseId }, $set: { updatedBy } }, { new: true })
  },

  deleteById(id) {
    return Group.findByIdAndDelete(id)
  },
}
