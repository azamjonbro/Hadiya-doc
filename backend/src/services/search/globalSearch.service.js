import { Course } from '../../models/course.model.js'
import { KbArticle } from '../../models/kbArticle.model.js'
import { User } from '../../models/user.model.js'
import { LearningPath } from '../../models/learningPath.model.js'
import { containsRegex } from '../../utils/escapeRegex.js'
import { isVisibleToActor } from '../access/visibility.js'
import { isCourseVisibleToActor } from '../courses/courseVisibility.js'
import { hasUnscopedAccess, scopedUserIdsFor } from '../access/actorScope.js'
import { PERMISSIONS } from '@lms/shared'

/**
 * One search box over everything.
 *
 * The rule that shapes the whole file is AT-24: results are filtered by what
 * the person may actually see, and a course they may not see does not appear
 * — not even its title. That is stricter than it sounds. A search result is
 * a leak in its own right: "Maxfiy strategiya" appearing in a list tells an
 * employee the course exists, who it is for, and roughly what it is about,
 * without them ever opening it.
 *
 * So visibility is applied *after* the query, per row, using the same
 * functions the catalogs use. Filtering in the query would mean a second
 * implementation of the visibility rule, and the two would drift — at which
 * point the search box becomes the way round the fence.
 *
 * Searching is substring rather than `$text`. A command palette is typed
 * into one letter at a time, and a full-text index matches whole words:
 * "mehn" would find nothing at all.
 */

// Deliberately more than the caller asked for. Rows are dropped by the
// visibility check afterwards, so querying exactly `limit` would return
// three results when ten were available and seven were filtered.
const OVERFETCH = 4

export const globalSearchService = {
  async search(actor, query, { types, limit = 8 } = {}) {
    const term = String(query ?? '').trim()
    // Two characters is where a prefix stops matching most of the database.
    // Below it the result list is noise and the query is expensive.
    if (term.length < 2) return { query: term, items: [] }

    const wanted = new Set(types?.length ? types : ['COURSE', 'PATH', 'KB', 'USER'])
    const pattern = containsRegex(term)
    const groups = await Promise.all([
      wanted.has('COURSE') ? this.courses(actor, pattern, limit) : [],
      wanted.has('PATH') ? this.paths(actor, pattern, limit) : [],
      wanted.has('KB') ? this.articles(actor, pattern, limit) : [],
      wanted.has('USER') ? this.users(actor, pattern, limit) : [],
    ])

    return { query: term, items: groups.flat() }
  },

  async courses(actor, pattern, limit) {
    const rows = await Course.find({
      deletedAt: null,
      status: 'PUBLISHED',
      $or: [{ title: pattern }, { tags: pattern }],
    })
      .limit(limit * OVERFETCH)
      .lean()

    const items = []
    for (const course of rows) {
      if (items.length >= limit) break
      // The catalog's own function, not a copy of its rule.
      if (!(await isCourseVisibleToActor(actor, course))) continue
      items.push({
        type: 'COURSE',
        id: String(course._id),
        title: course.title,
        subtitle: course.description?.slice(0, 120) ?? '',
        url: `/courses/${course._id}`,
      })
    }
    return items
  },

  async paths(actor, pattern, limit) {
    const rows = await LearningPath.find({ deletedAt: null, status: 'PUBLISHED', title: pattern })
      .limit(limit * OVERFETCH)
      .lean()

    const items = []
    for (const path of rows) {
      if (items.length >= limit) break
      if (!(await isVisibleToActor(actor, path))) continue
      items.push({
        type: 'PATH',
        id: String(path._id),
        title: path.title,
        subtitle: path.description?.slice(0, 120) ?? '',
        url: `/paths/${path._id}`,
      })
    }
    return items
  },

  async articles(actor, pattern, limit) {
    const rows = await KbArticle.find({
      deletedAt: null,
      status: 'PUBLISHED',
      $or: [{ title: pattern }, { summary: pattern }, { tags: pattern }],
    })
      .limit(limit * OVERFETCH)
      .lean()

    const items = []
    for (const article of rows) {
      if (items.length >= limit) break
      if (!(await isVisibleToActor(actor, article))) continue
      items.push({
        type: 'KB',
        id: String(article._id),
        title: article.title,
        subtitle: article.summary?.slice(0, 120) ?? '',
        url: `/kb/${article.slug}`,
      })
    }
    return items
  },

  /**
   * People, for callers who may look people up at all.
   *
   * Two fences, not one: the permission decides whether this person may
   * search the directory, and the scope decides which people they get back
   * — a TEAM-scoped supervisor searching a surname must not discover the
   * rest of the company through the palette (2.2).
   */
  async users(actor, pattern, limit) {
    if (!actor.permissions?.includes(PERMISSIONS.USER_READ)) return []

    const filter = {
      isActive: true,
      // Deliberately name only. JSHSHIR is an identifier, not
      // search terms, and matching on them turns the palette into a way of
      // confirming somebody's national id one guess at a time.
      $or: [{ fullName: pattern }, { email: pattern }],
    }
    if (!hasUnscopedAccess(actor)) {
      const allowed = await scopedUserIdsFor(actor)
      filter._id = { $in: allowed }
    }

    const rows = await User.find(filter, { fullName: 1, position: 1, department: 1, avatar: 1 })
      .limit(limit)
      .lean()

    return rows.map((user) => ({
      type: 'USER',
      id: String(user._id),
      title: user.fullName,
      subtitle: [user.position, user.department].filter(Boolean).join(' · '),
      avatar: user.avatar ?? '',
      url: `/bos/users/${user._id}`,
    }))
  },
}
