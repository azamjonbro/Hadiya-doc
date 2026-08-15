import { Course } from '../models/course.model.js'

export const courseRepository = {
  findById(id) {
    return Course.findById(id)
  },

  findBySlug(slug) {
    return Course.findOne({ slug })
  },

  findByIds(ids) {
    return Course.find({ _id: { $in: ids } })
  },

  // Ids only — used for cache invalidation fan-out, where pulling whole
  // course documents would be wasted work.
  async listAllIds() {
    const rows = await Course.find({}, { _id: 1 }).lean()
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

  // `visibleToRoleName`/`visibleToDepartment` scope the page to courses an
  // employee is actually allowed to see: unrestricted courses (empty
  // targetRoles/department) plus courses matching both of their own
  // role and department where those constraints are set.
  //
  // Shared by listPage and count so a page and its total can never be
  // computed from two subtly different filters.
  buildFilter({ search, status, visibleToRoleName, visibleToDepartment }) {
    const filter = {}
    if (search) filter.title = new RegExp(search.trim(), 'i')
    if (status) filter.status = status
    if (visibleToRoleName !== undefined) {
      // Courses created before targetRoles/department existed have neither
      // field stored at all (Mongoose schema defaults don't backfill old
      // documents) — $exists:false must count as "unrestricted" alongside
      // an explicit empty array/string, or every pre-existing course would
      // wrongly disappear from non-admin catalogs.
      filter.$and = [
        { $or: [{ targetRoles: { $exists: false } }, { targetRoles: { $size: 0 } }, { targetRoles: visibleToRoleName }] },
        { $or: [{ department: { $exists: false } }, { department: '' }, { department: visibleToDepartment ?? '' }] },
      ]
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
