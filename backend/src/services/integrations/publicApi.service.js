import { User } from '../../models/user.model.js'
import { Course } from '../../models/course.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { Certificate } from '../../models/certificate.model.js'

/**
 * What the public API returns (11.1).
 *
 * Its own payload builders rather than the app's: the shapes the SPA reads
 * change with the SPA, and an integration that breaks because a screen was
 * redesigned is the thing a versioned public API exists to prevent. These
 * are also deliberately smaller — an HR system needs a person's id, name
 * and where they work, not their attention-monitoring settings.
 */

/**
 * Identifiers are masked unless the key is explicitly allowed them.
 *
 * The JSHSHIR is the login identifier and a national id; 0.1 removed it
 * from the leaderboard for the same reason. A sync that has to match people
 * against another system needs it and says so on its key; a dashboard
 * counting completions does not.
 */
function maskJshshir(value) {
  const text = String(value ?? '')
  return text.length > 4 ? `${'*'.repeat(text.length - 4)}${text.slice(-4)}` : text
}

function toPublicUser(user, { includePii }) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    firstName: user.firstName,
    lastName: user.lastName,
    jshshir: includePii ? user.jshshir : maskJshshir(user.jshshir),
    email: includePii ? (user.email ?? '') : '',
    branch: user.branch ?? '',
    department: user.department ?? '',
    position: user.position ?? '',
    isActive: user.isActive !== false,
    hireDate: user.hireDate ?? null,
    createdAt: user.createdAt,
  }
}

function toPublicCourse(course) {
  return {
    id: course._id.toString(),
    title: course.title,
    slug: course.slug,
    description: course.description ?? '',
    status: course.status,
    level: course.level ?? '',
    tags: course.tags ?? [],
    estimatedMinutes: course.estimatedMinutes ?? 0,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  }
}

/** Cursor-free paging: an integration walks pages, not offsets it invents. */
function pageOf(page = 1, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const safePage = Math.max(Number(page) || 1, 1)
  return { skip: (safePage - 1) * safeLimit, limit: safeLimit, page: safePage }
}

export const publicApiService = {
  async users({ page, limit, branch, department, updatedSince, includePii }) {
    const { skip, limit: take, page: current } = pageOf(page, limit)
    const filter = { deletedAt: null }
    if (branch) filter.branch = branch
    if (department) filter.department = department
    // The field an integration actually needs: "what changed since my last
    // sync" is the whole reason to poll.
    if (updatedSince) filter.updatedAt = { $gte: new Date(updatedSince) }

    const [rows, total] = await Promise.all([
      User.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(take).lean(),
      User.countDocuments(filter),
    ])
    return { items: rows.map((row) => toPublicUser(row, { includePii })), total, page: current, limit: take }
  },

  async courses({ page, limit, status, updatedSince }) {
    const { skip, limit: take, page: current } = pageOf(page, limit)
    const filter = { deletedAt: null }
    // Published by default: a draft course is somebody's work in progress,
    // and an integration listing it would put unfinished titles in front of
    // whoever reads that system.
    filter.status = status ?? 'PUBLISHED'
    if (updatedSince) filter.updatedAt = { $gte: new Date(updatedSince) }

    const [rows, total] = await Promise.all([
      Course.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(take).lean(),
      Course.countDocuments(filter),
    ])
    return { items: rows.map(toPublicCourse), total, page: current, limit: take }
  },

  /**
   * Who is on what, and how far.
   *
   * The feed an HR system asks for. `completedSince` is the shape that
   * matters in practice: "give me everybody who finished something since
   * yesterday" is one request, not a walk of every assignment.
   */
  async assignments({ page, limit, userId, courseId, status, completedSince }) {
    const { skip, limit: take, page: current } = pageOf(page, limit)
    const filter = {}
    if (userId) filter.userId = userId
    if (courseId) filter.courseId = courseId
    if (status) filter.status = status
    if (completedSince) filter.completedAt = { $gte: new Date(completedSince) }

    const [rows, total] = await Promise.all([
      CourseAssignment.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(take)
        .populate('userId', 'fullName')
        .populate('courseId', 'title')
        .lean(),
      CourseAssignment.countDocuments(filter),
    ])

    return {
      items: rows.map((row) => ({
        id: row._id.toString(),
        userId: String(row.userId?._id ?? row.userId),
        userName: row.userId?.fullName ?? '',
        courseId: String(row.courseId?._id ?? row.courseId),
        courseTitle: row.courseId?.title ?? '',
        status: row.status,
        dueAt: row.dueAt ?? null,
        completedAt: row.completedAt ?? null,
        mandatory: row.mandatory ?? false,
      })),
      total,
      page: current,
      limit: take,
    }
  },

  /**
   * Issued certificates, by serial.
   *
   * The serial is the field another system stores, because it is what a
   * person's paper copy carries and what the public verification page
   * checks — an integration that recorded our internal id could not answer
   * "is this certificate real".
   */
  async certificates({ page, limit, userId, issuedSince }) {
    const { skip, limit: take, page: current } = pageOf(page, limit)
    const filter = {}
    if (userId) filter.userId = userId
    if (issuedSince) filter.issuedAt = { $gte: new Date(issuedSince) }

    const [rows, total] = await Promise.all([
      Certificate.find(filter).sort({ issuedAt: -1 }).skip(skip).limit(take).lean(),
      Certificate.countDocuments(filter),
    ])

    return {
      items: rows.map((row) => ({
        id: row._id.toString(),
        serial: row.serial,
        userId: String(row.userId),
        sourceType: row.sourceType,
        sourceId: row.sourceId ? String(row.sourceId) : null,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt ?? null,
        revokedAt: row.revokedAt ?? null,
        score: row.score ?? '',
      })),
      total,
      page: current,
      limit: take,
    }
  },
}
