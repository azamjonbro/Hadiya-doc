import mongoose from 'mongoose'

/**
 * The pieces every report builder needs.
 *
 * Lifted out of reportData.service.js when the second file of builders
 * arrived (8.1). Duplicating them would have been the easy move and the
 * wrong one: `intersectIds` in particular encodes the access fence, and two
 * copies of a fence is one copy that will eventually be wrong.
 */

// Hard cap on rows in a synchronous export — an admin exporting the whole
// org is legitimate, but an unbounded export is a resource-exhaustion
// vector on a shared server.
//
// The cap was never the problem; cutting silently was. Every builder
// reports `totalRows` alongside its rows so a truncated file cannot be
// mistaken for a complete one (AT-22).
export const MAX_ROWS = 5000

// What an async export may fetch. Higher because nobody is waiting on an
// HTTP response — but still bounded.
export const ASYNC_MAX_ROWS = 100000

/**
 * The row cap for this build.
 *
 * Threaded through `filters` rather than read from module state, because an
 * async job and a synchronous request can be in flight at once and a
 * mutable global would give one of them the other's limit.
 */
export function capFor(filters) {
  return filters.maxRows ?? MAX_ROWS
}

/**
 * Runs an aggregation and gets both the capped rows and the true total in
 * one pass.
 *
 * `$facet` rather than two queries: the grouping stage is the expensive part
 * of these pipelines, and running it twice just to learn a number would
 * double the cost of every export.
 */
export async function facetRows(model, pipeline, { sort, project, cap = MAX_ROWS }) {
  const [result] = await model.aggregate([
    ...pipeline,
    {
      $facet: {
        rows: [...(sort ? [{ $sort: sort }] : []), { $limit: cap }, ...(project ? [{ $project: project }] : [])],
        total: [{ $count: 'count' }],
      },
    },
  ])
  return { rows: result?.rows ?? [], totalRows: result?.total?.[0]?.count ?? 0 }
}

/**
 * The row count a report *would* have produced, uncapped.
 *
 * Counted separately rather than by fetching and measuring: the point of
 * the cap is not to load 8 000 rows into memory, so the honest number has
 * to come from a count query.
 */
export function countFor(model, filter) {
  return model.countDocuments(filter)
}

export function round1(n) {
  return Math.round((n ?? 0) * 10) / 10
}

export function toObjectId(id) {
  return new mongoose.Types.ObjectId(id)
}

export function toObjectIds(ids) {
  return ids.map(toObjectId)
}

/**
 * Combines any number of id lists (each meaning "must be one of these").
 *
 * `null`/`undefined` entries mean "no constraint from this filter" and are
 * ignored. Returns `null` when nothing constrained at all, otherwise an
 * array — possibly empty, meaning nothing satisfies every constraint at
 * once, which is a real answer and not the same as "no filter".
 */
export function intersectIds(...idLists) {
  const constraints = idLists.filter((list) => list !== null && list !== undefined)
  if (constraints.length === 0) return null
  const sets = constraints.map((list) => new Set(list.map((id) => id.toString())))
  const [first, ...rest] = sets
  let result = first
  for (const set of rest) {
    result = new Set([...result].filter((id) => set.has(id)))
  }
  return [...result]
}

export function dateRangeMatch(field, filters) {
  const range = {}
  if (filters.dateFrom) range.$gte = filters.dateFrom
  if (filters.dateTo) range.$lte = filters.dateTo
  return Object.keys(range).length ? { [field]: range } : {}
}

/** A date as YYYY-MM-DD, or an empty cell. ISO in every language: these get
 *  sorted and filtered in Excel far more often than they are read as prose. */
export function isoDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

/**
 * `{ userId: { $in: ... } }` for a builder's population, or `{}`.
 *
 * Every builder narrows through this, which is what makes the scope fence
 * land on all of them at once — a new report cannot forget to apply it
 * without also forgetting to filter by user at all.
 */
export function userScopeMatch(ids, field = 'userId') {
  return ids ? { [field]: { $in: toObjectIds(ids) } } : {}
}
