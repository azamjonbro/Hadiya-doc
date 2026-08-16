import { userRepository } from '../../repositories/user.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'

// Shared by course.service.js (catalog list/detail) and
// courseAssignment.service.js (self-enroll) so "is this course visible to
// this actor" has exactly one definition.
//
// Unrestricted (no targetRoles, no branches, no department) is always
// visible. When a constraint is set it must match; constraints combine with
// AND, so a course limited to the Marketing department of the Toshkent branch
// reaches only people who are in both.
//
// An explicit assignment overrides all of it. That is the admin escape hatch:
// assigning a Toshkent-only course to one person in Samarqand is a deliberate
// act by someone who already has the permission to do it, and it used to
// produce an assignment the recipient could never open — assign() never
// checked targeting on the way in, and this function did not know about
// assignments on the way out, so the course 404'd for them.
export async function isCourseVisibleToActor(actor, course) {
  const roleRestricted = course.targetRoles?.length > 0
  const branchRestricted = course.branches?.length > 0
  const deptRestricted = Boolean(course.department)
  if (!roleRestricted && !branchRestricted && !deptRestricted) return true

  if (roleRestricted && !course.targetRoles.includes(actor.roleName)) {
    return isAssignedTo(actor, course)
  }
  if (!branchRestricted && !deptRestricted) return true

  const actorUser = await userRepository.findById(actor.id)
  if (branchRestricted && !course.branches.includes(actorUser?.branch ?? '')) {
    return isAssignedTo(actor, course)
  }
  if (deptRestricted && actorUser?.department !== course.department) {
    return isAssignedTo(actor, course)
  }
  return true
}

async function isAssignedTo(actor, course) {
  const assignment = await courseAssignmentRepository.findByUserAndCourse(actor.id, course._id ?? course.id)
  return Boolean(assignment)
}
