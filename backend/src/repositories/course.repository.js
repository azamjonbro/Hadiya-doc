import { Course } from '../models/course.model.js'

export const courseRepository = {
  // Trashed courses are invisible to every normal read. The trash page uses
  // findAnyById/listTrashed below, which are the only two ways back to them.
  findById(id) {
    return Course.findOne({ _id: id, deletedAt: null })
  },

  findAnyById(id) {
    return Course.findById(id)
  },

  // Deliberately unfiltered: a trashed course still owns its slug (the index
  // is unique), so the create path has to see it or it would mint a duplicate
  // that fails on insert.
  findBySlug(slug) {
    return Course.findOne({ slug })
  },

  findByIds(ids) {
    return Course.find({ _id: { $in: ids }, deletedAt: null })
  },

  listExpired(before) {
    return Course.find({ deletedAt: { $ne: null, $lte: before } })
  },

  listTrashed() {
    return Course.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).limit(200)
  },

  softDelete(id, actorId) {
    return Course.findByIdAndUpdate(id, { $set: { deletedAt: new Date(), deletedBy: actorId } }, { new: true })
  },

  restore(id) {
    return Course.findByIdAndUpdate(id, { $set: { deletedAt: null, deletedBy: null } }, { new: true })
  },

  // Ids only — used for cache invalidation fan-out, where pulling whole
  // course documents would be wasted work.
  async listAllIds() {
    const rows = await Course.find({ deletedAt: null }, { _id: 1 }).lean()
    return rows.map((row) => row._id.toString())
  },

  create(data) {
    return Course.create(data)
  },

  updateById(id, data) {
    return Course.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
  },

  archive(id) {
    return Course.findByIdAndUpdate(id, { $set: { status: 'ARCHIVED' } }, { new: true })
  },

  // Irreversible, unlike archive() — only reached from the hard-delete flow,
  // which drops the course's children first (courseCascade.repository.js).
  deleteById(id) {
    return Course.findByIdAndDelete(id)
  },

  // `visibleTo*` scope the page to courses an employee is actually allowed to
  // see: unrestricted courses (empty targetRoles/branches/department) plus
  // courses matching their own role, branch and department wherever those
  // constraints are set — plus anything explicitly assigned to them, which
  // overrides targeting entirely (see courseVisibility.js).
  //
  // `branch` filters the admin catalog instead when passed on its own: admins
  // are not scoped by visibility, so it is a plain "show me this branch's
  // courses" facet for them.
  //
  // Shared by listPage and count so a page and its total can never be
  // computed from two subtly different filters.
  buildFilter({ search, status, branch, visibleToRoleName, visibleToBranch, visibleToDepartment, assignedCourseIds }) {
    const filter = { deletedAt: null }
    if (search) filter.title = new RegExp(search.trim(), 'i')
    if (status) filter.status = status
    if (branch) filter.branches = branch
    if (visibleToRoleName !== undefined) {
      // Courses created before targetRoles/branches/department existed have
      // none of those fields stored at all (Mongoose schema defaults don't
      // backfill old documents) — $exists:false must count as "unrestricted"
      // alongside an explicit empty array/string, or every pre-existing
      // course would wrongly disappear from non-admin catalogs.
      const matchesTargeting = {
        $and: [
          { $or: [{ targetRoles: { $exists: false } }, { targetRoles: { $size: 0 } }, { targetRoles: visibleToRoleName }] },
          { $or: [{ branches: { $exists: false } }, { branches: { $size: 0 } }, { branches: visibleToBranch ?? '' }] },
          { $or: [{ department: { $exists: false } }, { department: '' }, { department: visibleToDepartment ?? '' }] },
        ],
      }
      filter.$and = assignedCourseIds?.length
        ? [{ $or: [matchesTargeting, { _id: { $in: assignedCourseIds } }] }]
        : [matchesTargeting]
    }
    return filter
  },

  // Two modes on purpose:
  //  - `page` (1-based) skips into the result set, which is what a numbered
  //    pager needs — it has to jump to page 7 without walking pages 1..6.
  //  - `cursor` keeps the original keyset behaviour for "load more" callers,
  //    which stays cheap on large collections.
  // Both sort by _id so a document never shifts between pages mid-read.
  listPage(params) {
    const { cursor, page, limit } = params
    const filter = this.buildFilter(params)
    if (cursor) filter._id = { $gt: cursor }

    const query = Course.find(filter).sort({ _id: 1 })
    if (page) return query.skip((page - 1) * limit).limit(limit)
    // One extra row is the "is there a next page?" probe for cursor mode.
    return query.limit(limit + 1)
  },

  count(params) {
    return Course.countDocuments(this.buildFilter(params))
  },
}
