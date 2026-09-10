import { Session } from '../../models/session.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { hashOpaqueToken } from '../../utils/tokens.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * "Where am I signed in?", and the button that ends one of them (11.6).
 *
 * The sessions were always there — a refresh token is a row — but nothing
 * showed them to the person they belong to. That is the gap this closes:
 * the platform sends a "new device" notification (0.x) and until now the
 * only thing somebody could do about it was change their password, which
 * ends every session including the one they are reading the mail on.
 *
 * The current session is marked rather than hidden: "this device" is the
 * label that makes the list readable, and hiding it would leave somebody
 * wondering which row is theirs.
 */

/**
 * A user-agent string, shortened to something a person recognises.
 *
 * Deliberately crude. Parsing user agents properly needs a library and a
 * database that ages, and the question being answered is only "is this
 * the laptop or the phone?" — for which "Chrome · Windows" is enough.
 */
export function describeDevice(userAgent) {
  const ua = String(userAgent ?? '')
  if (!ua) return 'Unknown device'

  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /okhttp|Dart|axios|curl/i.test(ua) ? 'App'
    : 'Browser'

  const platform =
    /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : ''

  return platform ? `${browser} · ${platform}` : browser
}

function toPublicSession(session, currentHash) {
  return {
    id: session._id.toString(),
    device: describeDevice(session.userAgent),
    // The raw string too: the summary above is a guess, and somebody
    // deciding whether to end a session should be able to see the
    // evidence.
    userAgent: session.userAgent ?? '',
    ip: session.ip ?? '',
    createdAt: session.createdAt,
    lastSeenAt: session.updatedAt,
    expiresAt: session.expiresAt,
    current: session.refreshTokenHash === currentHash,
  }
}

export const sessionService = {
  /**
   * The caller's own live sessions, newest first.
   *
   * Revoked and expired ones are left out: this is a list to act on, and
   * a session somebody already ended is not something they can end again.
   */
  async list(actor, currentRefreshToken) {
    const currentHash = currentRefreshToken ? hashOpaqueToken(currentRefreshToken) : null
    const rows = await Session.find({
      userId: actor.id,
      revoked: false,
      expiresAt: { $gt: new Date() },
    })
      .sort({ updatedAt: -1 })
      .lean()
    return rows.map((row) => toPublicSession(row, currentHash))
  },

  /**
   * Ends one session.
   *
   * Scoped to the caller's own rows by the query, not by a check
   * afterwards: an id from somebody else's account then reads as "not
   * found", which is both the right answer and the one that leaks
   * nothing.
   */
  async revoke(actor, sessionId, currentRefreshToken) {
    const session = await Session.findOne({ _id: sessionId, userId: actor.id })
    if (!session) throw ApiError.notFound('Session not found')

    const currentHash = currentRefreshToken ? hashOpaqueToken(currentRefreshToken) : null
    await Session.updateOne({ _id: session._id }, { $set: { revoked: true } })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'SESSION_REVOKED',
      entity: 'Session',
      entityId: String(sessionId),
      metadata: { device: describeDevice(session.userAgent), ip: session.ip },
    })
    // Told, rather than left for the client to work out: ending the
    // current session means the app has to sign out, and it cannot know
    // that from a 200.
    return { id: String(sessionId), wasCurrent: session.refreshTokenHash === currentHash }
  },

  /**
   * Ends every other session — the "somebody else has my password" button.
   *
   * Keeps the current one on purpose: the alternative signs the person out
   * of the device they are using to secure their account, which is exactly
   * the moment to keep them in.
   */
  async revokeOthers(actor, currentRefreshToken) {
    const currentHash = currentRefreshToken ? hashOpaqueToken(currentRefreshToken) : null
    // Refused rather than guessed at. The button promises to keep *this*
    // session, and without the refresh cookie there is no way to tell
    // which one that is — proceeding would sign somebody out of the device
    // they are using to secure their account, which is the opposite of
    // what they asked for. (A caller with no cookie: a token-only API
    // client, or a session whose cookie has already expired.)
    if (!currentHash) {
      throw ApiError.badRequest(
        'This request cannot tell which session is the current one — sign in again first',
        'SESSION_CURRENT_UNKNOWN'
      )
    }
    const filter = {
      userId: actor.id,
      revoked: false,
      refreshTokenHash: { $ne: currentHash },
    }
    const result = await Session.updateMany(filter, { $set: { revoked: true } })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'SESSIONS_REVOKED_OTHERS',
      entity: 'User',
      entityId: String(actor.id),
      metadata: { count: result.modifiedCount },
    })
    return { revoked: result.modifiedCount }
  },
}
