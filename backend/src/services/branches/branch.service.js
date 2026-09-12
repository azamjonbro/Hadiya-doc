import { Branch } from '../../models/branch.model.js'
import { OrgList } from '../../models/orgList.model.js'
import { User } from '../../models/user.model.js'
import { Course } from '../../models/course.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { escapeRegex } from '../../utils/escapeRegex.js'

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

  /**
   * The org chart as the reference draws it (rasm «Подразделения»): the
   * company, then every branch, then the departments people in that branch
   * sit in, then their subdivisions — each with its code, head and
   * headcount. Departments and subdivisions are what employees are tagged
   * with, so the shape comes from the people; the OrgList rows only add
   * the code and the head.
   */
  async tree() {
    const [branches, lists, people] = await Promise.all([
      Branch.find().sort({ name: 1 }).lean(),
      OrgList.find({ type: { $in: ['DEPARTMENT', 'SUBDIVISION'] } }).lean(),
      User.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: { branch: { $ifNull: ['$branch', ''] }, department: { $ifNull: ['$department', ''] }, subdivision: { $ifNull: ['$subdivision', ''] } },
            n: { $sum: 1 },
          },
        },
      ]),
    ])
    const headIds = [...new Set([...branches, ...lists].map((r) => r.headId && String(r.headId)).filter(Boolean))]
    const heads = headIds.length ? await User.find({ _id: { $in: headIds } }, { fullName: 1 }).lean() : []
    const headName = new Map(heads.map((u) => [String(u._id), u.fullName]))
    const listByKey = (type) => new Map(lists.filter((l) => l.type === type).map((l) => [l.nameKey, l]))
    const departments = listByKey('DEPARTMENT')
    const subdivisions = listByKey('SUBDIVISION')

    const unit = (kind, name, row) => ({
      kind,
      id: row ? String(row._id) : null,
      name,
      code: row?.code ?? '',
      headId: row?.headId ? String(row.headId) : null,
      headName: row?.headId ? (headName.get(String(row.headId)) ?? '') : '',
      users: 0,
      children: [],
    })

    const branchNodes = new Map()
    for (const b of branches) branchNodes.set(b.nameKey, unit('branch', b.name, b))
    const rootDepartments = new Map()
    const total = people.reduce((sum, row) => sum + row.n, 0)

    for (const row of people) {
      const { branch, department, subdivision } = row._id
      let parent = null
      if (branch) {
        const key = branch.toLowerCase()
        if (!branchNodes.has(key)) branchNodes.set(key, unit('branch', branch, null))
        parent = branchNodes.get(key)
        parent.users += row.n
      }
      if (department) {
        const holder = parent ? parent.children : null
        const key = department.toLowerCase()
        let dep = parent ? holder.find((c) => c.kind === 'department' && c.name.toLowerCase() === key) : rootDepartments.get(key)
        if (!dep) {
          dep = unit('department', department, departments.get(key))
          if (parent) holder.push(dep)
          else rootDepartments.set(key, dep)
        }
        dep.users += row.n
        if (subdivision) {
          const skey = subdivision.toLowerCase()
          let sub = dep.children.find((c) => c.name.toLowerCase() === skey)
          if (!sub) {
            sub = unit('subdivision', subdivision, subdivisions.get(skey))
            dep.children.push(sub)
          }
          sub.users += row.n
        }
      }
    }
    // Declared departments nobody is in yet still belong on the chart.
    for (const [key, row] of departments) {
      const seen = [...branchNodes.values()].some((b) => b.children.some((d) => d.name.toLowerCase() === key)) || rootDepartments.has(key)
      if (!seen) rootDepartments.set(key, unit('department', row.name, row))
    }
    const sortTree = (nodes) => nodes.sort((a, b) => a.name.localeCompare(b.name)).map((n) => ({ ...n, children: sortTree(n.children) }))
    return {
      total,
      branches: sortTree([...branchNodes.values()]),
      departments: sortTree([...rootDepartments.values()]),
    }
  },

  async create(actor, name, { code = '', headId = null } = {}) {
    const trimmed = name.trim()
    if (!trimmed) throw ApiError.badRequest('Branch name is required', 'BRANCH_NAME_REQUIRED')

    const existing = await Branch.findOne({ nameKey: trimmed.toLowerCase() })
    if (existing) throw ApiError.conflict('A branch with this name already exists', 'BRANCH_EXISTS')

    const branch = await Branch.create({ name: trimmed, nameKey: trimmed.toLowerCase(), code, headId: headId || null, createdBy: actor.id })
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
  async rename(actor, id, name, { code, headId } = {}) {
    const trimmed = name.trim()
    if (!trimmed) throw ApiError.badRequest('Branch name is required', 'BRANCH_NAME_REQUIRED')

    const branch = await Branch.findById(id)
    if (!branch) throw ApiError.notFound('Branch not found')
    if (code !== undefined) branch.code = code
    if (headId !== undefined) branch.headId = headId || null
    if (branch.name === trimmed) {
      await branch.save()
      return { id, name: trimmed, code: branch.code, headId: branch.headId ? String(branch.headId) : null, movedUsers: 0, movedCourses: 0 }
    }

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
   * Deleting a branch, with or without the records that are still in it.
   *
   * Default (`force` off) only an empty branch can go: deleting one that is
   * still in use would leave users and courses tagged with a name that no
   * longer exists — which reads as working right up until someone wonders why
   * a course reaches nobody.
   *
   * With `force` the same delete is allowed, but the tag goes with it: the
   * employees are moved to no branch and the name is pulled out of every
   * course that targets it. That is the destructive half, and it is why the
   * admin page asks for confirmation naming both counts first — a course left
   * with an empty `branches` array is no longer branch-restricted at all, so
   * it becomes visible to everyone rather than to nobody.
   *
   * `id` addresses a declared branch. `name` addresses one by name, which is
   * the only handle an undeclared branch has: a name that only ever existed
   * on employee and course records has no Branch document to delete, and
   * without this there was no way to clear it from this page at all.
   */
  async remove(actor, { id, name, force = false }) {
    const branch = id
      ? await Branch.findById(id)
      : await Branch.findOne({ nameKey: (name ?? '').trim().toLowerCase() })

    // Prefer the declared spelling; fall back to what the caller asked for,
    // which is all an undeclared branch has.
    const branchName = branch?.name ?? (name ?? '').trim()
    if (!branchName) throw ApiError.notFound('Branch not found')
    if (id && !branch) throw ApiError.notFound('Branch not found')

    // Case-insensitively, the same way the overview groups them and the same
    // way the unique index treats the name: a record tagged "toshkent" is in
    // the branch named "Toshkent". Counting exact-case here would let a branch
    // the page shows as occupied be deleted, and the name would stay on those
    // records — the row would simply come back as an undeclared branch.
    const nameMatch = new RegExp(`^${escapeRegex(branchName)}$`, 'i')
    const [users, courses] = await Promise.all([
      User.countDocuments({ branch: nameMatch }),
      Course.countDocuments({ branches: nameMatch, deletedAt: null }),
    ])

    if (!force && (users || courses)) {
      throw ApiError.conflict(
        `Branch is still in use: ${users} employee(s), ${courses} course(s)`,
        'BRANCH_IN_USE',
        { users, courses }
      )
    }

    // Nothing declared and nothing tagged: the row the caller is looking at
    // does not exist any more, which is worth saying rather than reporting a
    // delete that removed nothing.
    if (!branch && !users && !courses) throw ApiError.notFound('Branch not found')

    let detachedUsers = 0
    let detachedCourses = 0
    if (force && (users || courses)) {
      const [userResult, courseResult] = await Promise.all([
        User.updateMany({ branch: nameMatch }, { $set: { branch: '' } }),
        Course.updateMany({ branches: nameMatch, deletedAt: null }, { $pull: { branches: nameMatch } }),
      ])
      detachedUsers = userResult.modifiedCount
      detachedCourses = courseResult.modifiedCount
    }

    if (branch) await branch.deleteOne()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'BRANCH_DELETED',
      entity: 'Branch',
      entityId: branch?._id.toString() ?? null,
      metadata: { name: branchName, force, detachedUsers, detachedCourses, declared: Boolean(branch) },
    })
    return { id: branch?._id.toString() ?? null, name: branchName, detachedUsers, detachedCourses }
  },
}
