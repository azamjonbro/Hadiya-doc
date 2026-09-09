import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { isVisibleToActor } from '../access/visibility.js'

/**
 * Course visibility, in terms of the shared rule.
 *
 * The rule itself moved to services/access/visibility.js in 5.1, because
 * learning paths ask the same question of the same three fields and a
 * second copy is how the two come to disagree about what an empty
 * `branches` array means. What stays here is the part that is genuinely
 * course-specific: which collection an explicit assignment lives in.
 */
export function isCourseVisibleToActor(actor, course) {
  return isVisibleToActor(actor, course, {
    isAssigned: async () =>
      Boolean(await courseAssignmentRepository.findByUserAndCourse(actor.id, course._id ?? course.id)),
  })
}
