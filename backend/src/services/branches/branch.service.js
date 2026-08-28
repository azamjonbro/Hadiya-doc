import { Branch } from '../../models/branch.model.js'
import { User } from '../../models/user.model.js'
import { Course } from '../../models/course.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Branches are named, not referenced: User.branch and Course.branches store
 * the name itself, which is what every visibility check compares. The Branch
 * collection exists so one can be created before anybody is in it, and so a
 * rename has a record to act on — it is not the source of truth for what a
 * course targets.
 *
 * That is also why the list is a union: a name typed straight into the
 * employee form is a real branch whether or not anyone pressed "create".
 */
export const branchService = {
  async overview() {
    const [declared, people, courses] = await Promise.all([
      Branch.find().sort({ name: 1 }).lean(),
      userRepository.branchStats(),
      courseRepository.countsByBranch(),
    ])

    const byKey = new Map()
    const put = (name, patch) => {
      const key = name.toLowerCase()
      const existing = byKey.get(key) ?? { name, employees: 0, activeEmployees: 0, courses: 0, declared: false }
      byKey.set(key, { ...existing, ...patch, name: existing.name || name })
    }

    for (const b of declared) put(b.name, { id: b._id.toString(), declared: true })
    for (const row of people) put(row._id, { employees: row.total, activeEmployees: row.active })
    // A branch a course names but nobody is in still belongs on the page: it
    // usually means the course was targeted at an office before anyone moved
    // into it, so it currently reaches nobody.
    for (const row of courses) put(row._id, { courses: row.courses })

    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
  },

  async create(actor, name) {
    const trimmed = name.trim()
    if (!trimmed) throw ApiError.badRequest('Branch name is required', 'BRANCH_NAME_REQUIRED')

    const existing = await Branch.findOne({ nameKey: trimmed.toLowerCase() })
    if (existing) throw ApiError.conflict('A branch with this name already exists', 'BRANCH_EXISTS')

    const branch = await Branch.create({ name: trimmed, nameKey: trimmed.toLowerCase(), createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'BRANCH_CREATED',
      entity: 'Branch',
      entityId: branch._id.toString(),
      metadata: { name: trimmed },
    })
    return { id: branch._id.toString(), name: branch.name }
  },

  /**
   * Renaming has to move the tagged records with it. If it did not, every
   * course targeted at the old name would keep that name, match nobody, and
   * silently stop being visible — the failure would look like "the course
   * disappeared", days later, with nothing pointing back here.
   */
  async rename(actor, id, name) {
    const trimmed = name.trim()
    if (!trimmed) throw ApiError.badRequest('Branch name is required', 'BRANCH_NAME_REQUIRED')

    const branch = await Branch.findById(id)
    if (!branch) throw ApiError.notFound('Branch not found')
    if (branch.name === trimmed) return { id, name: trimmed, movedUsers: 0, movedCourses: 0 }

    const clash = await Branch.findOne({ nameKey: trimmed.toLowerCase(), _id: { $ne: id } })
    if (clash) throw ApiError.conflict('A branch with this name already exists', 'BRANCH_EXISTS')

    const oldName = branch.name
    branch.name = trimmed
    branch.nameKey = trimmed.toLowerCase()
    await branch.save()

    const [users, coursesResult] = await Promise.all([
      User.updateMany({ branch: oldName }, { $set: { branch: trimmed } }),
      // Positional operator: a course can target several branches, and only
      // the matching entry may change.
      Course.updateMany({ branches: oldName }, { $set: { 'branches.$[el]': trimmed } }, {
        arrayFilters: [{ el: oldName }],
      }),
    ])

    await auditLogRepository.record({
      actor: actor.id,
      action: 'BRANCH_RENAMED',
      entity: 'Branch',
      entityId: id,
      metadata: { from: oldName, to: trimmed, users: users.modifiedCount, courses: coursesResult.modifiedCount },
    })

    return { id, name: trimmed, movedUsers: users.modifiedCount, movedCourses: coursesResult.modifiedCount }
  },

  /**
   * Only an empty branch can go. Deleting one that is still in use would leave
   * users and courses tagged with a name that no longer exists — which reads
   * as working right up until someone wonders why a course reaches nobody.
   */
  async remove(actor, id) {
    const branch = await Branch.findById(id)
    if (!branch) throw ApiError.notFound('Branch not found')

    const [users, courses] = await Promise.all([
      User.countDocuments({ branch: branch.name }),
      Course.countDocuments({ branches: branch.name, deletedAt: null }),
    ])
    if (users || courses) {
      throw ApiError.conflict(
        `Branch is still in use: ${users} employee(s), ${courses} course(s)`,
        'BRANCH_IN_USE',
        { users, courses }
      )
    }

    await branch.deleteOne()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'BRANCH_DELETED',
      entity: 'Branch',
      entityId: id,
      metadata: { name: branch.name },
    })
    return { id }
  },
}
