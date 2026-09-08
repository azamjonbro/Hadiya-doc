import { scopedUserIdsFor, hasUnscopedAccess, actorScope } from '../services/access/actorScope.js'
import { cacheGet, cacheSet } from '../utils/cache.js'

/**
 * Puts the caller's allow-list on the request as `req.scopedUserIds`.
 *
 * `null` means no fence. An array — possibly empty — is the complete set of
 * people this caller may see data about, and a handler that ignores it is a
 * handler that leaks. The point of computing it here rather than in each
 * service is that a route which forgets to ask is visible: the value is
 * always on the request, so "did this endpoint apply scope" is answerable by
 * reading one line of the handler.
 *
 * Cached for five minutes. The underlying org walk is
 * cached too (orgHierarchy.service.js), but a DEPARTMENT actor's list comes
 * from a `distinct` over users, and that is worth not repeating on every
 * request a manager makes while paging through a list.
 */
const CACHE_TTL_SECONDS = 5 * 60

// Keyed on the scope as well as the person, not on the person alone.
//
// One actor can legitimately arrive with different scopes — a role edited in
// the permission grid (2.3), a role reassigned, or simply an older token
// still carrying the previous value for its remaining minutes. Keyed on the
// id alone, the first request's answer is served to the second, and the
// direction that goes wrong is the dangerous one: a DEPARTMENT list handed
// to a TEAM request is wider than the caller is entitled to.
const key = (actorId, scope) => `scope:userids:${scope}:${actorId}`

export function scopeToManagedUsers(req, _res, next) {
  if (!req.user) {
    next()
    return
  }

  if (hasUnscopedAccess(req.user)) {
    req.scopedUserIds = null
    next()
    return
  }

  const cacheKey = key(req.user.id, actorScope(req.user))
  cacheGet(cacheKey)
    .then(async (cached) => {
      if (cached) return cached
      const ids = await scopedUserIdsFor(req.user)
      await cacheSet(cacheKey, ids, CACHE_TTL_SECONDS)
      return ids
    })
    .then((ids) => {
      req.scopedUserIds = ids
      next()
    })
    // A scope that cannot be computed must not become "no scope". Failing
    // the request is the only safe answer: the alternative is answering it
    // with everybody's data because Redis or Mongo hiccuped.
    .catch(next)
}
