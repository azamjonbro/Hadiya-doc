import { userRepository } from '../../repositories/user.repository.js'

// Shared by course.service.js (catalog list/detail) and
// courseAssignment.service.js (self-enroll) so "is this course visible to
// this actor" has exactly one definition. Unrestricted (no targetRoles, no
// department) is always visible; when set, both constraints must match.
export async function isCourseVisibleToActor(actor, course) {
  const roleRestricted = course.targetRoles?.length > 0
  const deptRestricted = Boolean(course.department)
  if (!roleRestricted && !deptRestricted) return true
  if (roleRestricted && !course.targetRoles.includes(actor.roleName)) return false
  if (!deptRestricted) return true

  const actorUser = await userRepository.findById(actor.id)
  return actorUser?.department === course.department
}
