// Server-computed access flags — never trust a client-sent "is this
// accessible" claim. Shared between the assignment listing endpoints and
// the video playback authorization (Phase 7) so both derive access from
// exactly the same computation.
export function computeAccessFlags(assignment) {
  const now = new Date()
  const isExpired = Boolean(
    assignment.status === 'ACTIVE' && assignment.expiresAt && now > assignment.expiresAt
  )
  const isOverdue = Boolean(
    assignment.status === 'ACTIVE' && !isExpired && assignment.deadline && now > assignment.deadline
  )
  const notStartedYet = Boolean(assignment.startAt && now < assignment.startAt)
  // COMPLETED is a progress marker, not a revocation — videoEventProcessor.js
  // flips ACTIVE to COMPLETED purely so the dashboard stops showing a
  // finished course as "in progress" forever. Only CANCELLED (an assignment
  // actually withdrawn) should block access; a learner who finished a course
  // must still be able to reopen it to rewatch.
  const accessible = assignment.status !== 'CANCELLED' && !isExpired && !notStartedYet
  return { isExpired, isOverdue, accessible }
}
