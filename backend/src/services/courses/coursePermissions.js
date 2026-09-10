import { PERMISSIONS } from '@lms/shared'

/**
 * May this person edit the catalogue?
 *
 * `course:create` is the permission the whole course domain treats as "an
 * author, not a learner": it decides who sees drafts, who gets answer keys
 * with a test, who may reorder a topic, and who is refused a lesson that is
 * not published yet.
 *
 * One line, and it was written out eleven times — in the video, material,
 * assessment, course, topic, review, question, sequence, access and AI-chat
 * services. Eleven copies of a check is one copy that eventually disagrees
 * with the other ten, and the one that disagrees is the one nobody edits,
 * because the others all looked fine.
 *
 * `actor?.` rather than `actor.`: an unauthenticated caller reaches some of
 * these paths, and "no actor" is a legitimate no rather than a crash.
 */
export function canManageCourses(actor) {
  return Boolean(actor?.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}
