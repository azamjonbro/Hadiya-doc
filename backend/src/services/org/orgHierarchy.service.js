import mongoose from 'mongoose'
import { User } from '../../models/user.model.js'
import { ApiError } from '../../utils/ApiError.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'

/**
 * The org chart, and the question everything else asks of it: which people
 * does this person answer for?
 *
 * `managedUserIds` is the foundation of manager scope (2.2), so it has to be
 * both correct and cheap — it will be called on almost every request a
 * manager makes. Correct means transitive: a director manages their team
 * leads *and* everyone under them, or a report that stops at one level would
 * quietly hide half a department.
 */

// Deep enough for any real company — a fifteen-level chain would be a data
// error, not an organisation — and it is also what stops a cycle introduced
// by a bad import from walking forever. The write path refuses cycles, but a
// read that can hang is not something to leave to the write path alone.
const MAX_DEPTH = 15

const CACHE_TTL_SECONDS = 5 * 60
const scopeKey = (userId) => `org:managed:${userId}`

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value))

/** Everyone below `userId`, transitively, as an array of id strings. */
async function computeManagedUserIds(userId) {
  const [row] = await User.aggregate([
    { $match: { _id: toObjectId(userId) } },
    {
      $graphLookup: {
        from: 'users',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'managerId',
        as: 'reports',
        maxDepth: MAX_DEPTH,
      },
    },
    { $project: { reportIds: '$reports._id' } },
  ])
  return (row?.reportIds ?? []).map(String)
}

export const orgHierarchyService = {
  /**
   * Cached, because manager scope consults this on nearly every request and
   * an org chart changes a few times a month. Five minutes is the window in
   * which a just-moved employee can still be missing from their new
   * manager's view — short enough to be explained, long enough to matter.
   */
  async managedUserIds(userId) {
    const key = scopeKey(String(userId))
    const cached = await cacheGet(key)
    if (cached) return cached
    const ids = await computeManagedUserIds(userId)
    await cacheSet(key, ids, CACHE_TTL_SECONDS)
    return ids
  },

  /**
   * Invalidates the cached subtree for everyone above a moved employee.
   *
   * Moving one person changes the answer for their old manager, their new
   * one, and every manager above both — so the chain upwards is what has to
   * be dropped, not the person's own entry.
   */
  async invalidateFor(userId) {
    const chain = await this.managerChain(userId)
    const keys = [scopeKey(String(userId)), ...chain.map((ancestor) => scopeKey(String(ancestor._id)))]
    await cacheDel(...keys)
  },

  /** The managers above someone, nearest first. */
  async managerChain(userId) {
    const [row] = await User.aggregate([
      { $match: { _id: toObjectId(userId) } },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$managerId',
          connectFromField: 'managerId',
          connectToField: '_id',
          as: 'managers',
          maxDepth: MAX_DEPTH,
          depthField: 'depth',
        },
      },
      { $project: { managers: { _id: 1, fullName: 1, position: 1, depth: 1 } } },
    ])
    return (row?.managers ?? []).sort((a, b) => a.depth - b.depth)
  },

  /**
   * Refuses a managerId that would create a loop.
   *
   * A cycle is not a theoretical worry: two people who each report to the
   * other is one mistyped row in an HR export, and every traversal after it
   * either hangs or silently truncates at maxDepth. Called from the write
   * path, so the data can simply never contain one.
   */
  async assertNoCycle(userId, managerId) {
    if (!managerId) return
    if (String(userId) === String(managerId)) {
      throw ApiError.badRequest('An employee cannot report to themselves', 'HIERARCHY_CYCLE')
    }
    const chain = await this.managerChain(managerId)
    if (chain.some((ancestor) => String(ancestor._id) === String(userId))) {
      throw ApiError.badRequest(
        'That would make the reporting line a loop — the proposed manager already reports to this employee',
        'HIERARCHY_CYCLE'
      )
    }
  },

  /** Direct reports only, for rendering one level of the chart. */
  async directReports(userId) {
    return User.find({ managerId: userId, isActive: true }, { fullName: 1, position: 1, department: 1, avatar: 1 })
      .sort({ fullName: 1 })
      .lean()
  },

  /**
   * The subtree under someone, as a nested tree.
   *
   * Built from one flat query rather than a query per level: an org chart is
   * a few hundred rows at this scale, and the per-level version is the
   * classic N+1 that makes a chart page take seconds.
   */
  async subtree(rootId) {
    const root = await User.findById(rootId, { fullName: 1, position: 1, department: 1, avatar: 1 }).lean()
    if (!root) throw ApiError.notFound('User not found')

    const ids = await this.managedUserIds(rootId)
    const people = await User.find(
      { _id: { $in: ids }, isActive: true },
      { fullName: 1, position: 1, department: 1, avatar: 1, managerId: 1 }
    ).lean()

    const childrenByManager = new Map()
    for (const person of people) {
      const key = String(person.managerId)
      if (!childrenByManager.has(key)) childrenByManager.set(key, [])
      childrenByManager.get(key).push(person)
    }

    const build = (person) => ({
      id: String(person._id),
      fullName: person.fullName,
      position: person.position ?? '',
      department: person.department ?? '',
      avatar: person.avatar ?? '',
      reports: (childrenByManager.get(String(person._id)) ?? [])
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map(build),
    })

    return build(root)
  },

  /**
   * Everyone with no manager — the roots of the chart.
   *
   * Plural on purpose: a company has one chief executive but an import that
   * has not finished leaves many people unattached, and a chart that shows
   * only the first of them looks like the rest do not exist.
   */
  async roots() {
    return User.find({ managerId: null, isActive: true }, { fullName: 1, position: 1, department: 1 })
      .sort({ fullName: 1 })
      .lean()
  },
}
