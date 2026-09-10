/**
 * The event catalogue, and the payload each event carries (11.2).
 *
 * Deliberately a **closed list**. A webhook that can subscribe to anything
 * the platform happens to emit is a contract nobody can honour: the moment
 * an internal call is renamed, somebody's integration stops receiving what
 * it was built on. A name on this list is a promise; a name not on it is
 * refused when the subscription is created, not silently never delivered.
 *
 * The payloads are built here rather than passing the domain object
 * through, for the same reason the public API has its own shapes (11.1): a
 * mongoose document carries fields that exist for the SPA, change with it,
 * and occasionally hold data the receiver has no business seeing.
 */

export const WEBHOOK_EVENTS = [
  'user.created',
  'user.deactivated',
  'assignment.created',
  'course.completed',
  'course.reopened',
  'certificate.issued',
]

/** A subscription may only name events from the catalogue. */
export function unknownEvents(events = []) {
  return events.filter((event) => !WEBHOOK_EVENTS.includes(event))
}

/**
 * Identifiers never travel to a third-party endpoint.
 *
 * The public API can send a JSHSHIR when a key is explicitly granted it,
 * because there the receiver has authenticated and asked for that record.
 * A webhook is the opposite direction: the platform pushes, over somebody
 * else's TLS, to a URL that may be logged at every hop in between. The
 * receiver that needs the identifier can read it back with a key.
 */
function userRef(user) {
  if (!user) return null
  return {
    id: String(user._id ?? user.id),
    fullName: user.fullName ?? '',
    branch: user.branch ?? '',
    department: user.department ?? '',
    position: user.position ?? '',
  }
}

function courseRef(course) {
  if (!course) return null
  return {
    id: String(course._id ?? course.id),
    title: course.title ?? '',
    slug: course.slug ?? '',
  }
}

/**
 * `{ event, data }` for one occurrence.
 *
 * Every payload names the actors as `{ id, ... }` objects rather than bare
 * ids: the receiver almost always wants to show a name, and a webhook that
 * forces a lookup for every event turns one push into two requests.
 */
export const webhookPayloads = {
  'user.created': ({ user }) => ({ user: userRef(user) }),
  'user.deactivated': ({ user, reason = '' }) => ({ user: userRef(user), reason }),
  'assignment.created': ({ user, course, assignment }) => ({
    user: userRef(user),
    course: courseRef(course),
    assignment: {
      id: String(assignment?._id ?? assignment?.id ?? ''),
      mandatory: Boolean(assignment?.mandatory),
      deadline: assignment?.deadline ?? null,
      selfEnrolled: Boolean(assignment?.selfEnrolled),
    },
  }),
  'course.completed': ({ user, course, completionPercent = 0, completedAt }) => ({
    user: userRef(user),
    course: courseRef(course),
    completionPercent,
    completedAt: completedAt ?? new Date(),
  }),
  'course.reopened': ({ user, course, completionPercent = 0, reason = 'REQUIREMENTS_CHANGED' }) => ({
    user: userRef(user),
    course: courseRef(course),
    completionPercent,
    reason,
  }),
  'certificate.issued': ({ user, certificate }) => ({
    user: userRef(user),
    certificate: {
      id: String(certificate?._id ?? certificate?.id ?? ''),
      serial: certificate?.serial ?? '',
      sourceType: certificate?.sourceType ?? '',
      sourceTitle: certificate?.sourceTitle ?? '',
      score: certificate?.score ?? '',
      issuedAt: certificate?.issuedAt ?? null,
      validUntil: certificate?.validUntil ?? null,
    },
  }),
}

/**
 * The envelope, identical for every event.
 *
 * `id` is the delivery id, so a receiver can deduplicate — a webhook is
 * at-least-once by construction (a 200 that never reaches us is retried),
 * and telling the receiver how to deduplicate is cheaper than pretending
 * otherwise. `occurredAt` is when the thing happened, not when we sent it:
 * a delivery that succeeded on the fourth attempt an hour later must not
 * look like an event from an hour later.
 */
export function buildEnvelope({ id, event, data, occurredAt }) {
  return {
    id: String(id),
    event,
    occurredAt: (occurredAt ?? new Date()).toISOString(),
    data,
  }
}
