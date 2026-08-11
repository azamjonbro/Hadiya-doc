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
  const accessible = assignment.status === 'ACTIVE' && !isExpired && !notStartedYet
  return { isExpired, isOverdue, accessible }
}
