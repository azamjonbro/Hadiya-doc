import { userRepository } from '../../repositories/user.repository.js'

/**
 * The "Xodimlar" page for employees (portal §8): who works here, where,
 * and who to ask. The fields are the ones the chat directory already
 * shows everyone plus phone — what an intranet directory is for — and
 * never an identity number, a birth year or a manager's chain.
 */
const NEW_HIRE_DAYS = 30
const DEFAULT_LIMIT = 24
const MAX_LIMIT = 100

export const directoryService = {
  async list({ search = '', branch = '', department = '', subdivision = '', newOnly = false, page = 1, limit = DEFAULT_LIMIT } = {}) {
    const pageSize = Math.min(Math.max(1, limit), MAX_LIMIT)
    const newSince = newOnly ? new Date(Date.now() - NEW_HIRE_DAYS * 86400e3) : null
    const params = { search, branch, department, subdivision, newSince, page, limit: pageSize }
    const [rows, total] = await Promise.all([userRepository.listDirectoryPage(params), userRepository.countDirectory(params)])

    // Managers are named on the card; one lookup for the page's distinct
    // managers rather than one per row.
    const managerIds = [...new Set(rows.map((row) => row.managerId && String(row.managerId)).filter(Boolean))]
    const managers = managerIds.length ? await userRepository.findByIds(managerIds) : []
    const managerName = new Map(managers.map((m) => [String(m._id), m.fullName]))
    const cutoff = Date.now() - NEW_HIRE_DAYS * 86400e3

    return {
      items: rows.map((row) => ({
        id: String(row._id),
        fullName: row.fullName,
        avatar: row.avatar ?? '',
        branch: row.branch ?? '',
        department: row.department ?? '',
        subdivision: row.subdivision ?? '',
        position: row.position ?? '',
        email: row.email ?? '',
        phone: row.phone ?? '',
        managerId: row.managerId ? String(row.managerId) : null,
        managerName: row.managerId ? (managerName.get(String(row.managerId)) ?? '') : '',
        birthMonth: row.birthDate ? row.birthDate.getUTCMonth() + 1 : null,
        birthDay: row.birthDate ? row.birthDate.getUTCDate() : null,
        hireDate: row.hireDate ?? null,
        isNew: (row.hireDate ?? row.createdAt)?.getTime() >= cutoff,
      })),
      page,
      limit: pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  },

  // branch → department → subdivision with head-counts. An empty name is
  // a real bucket ("not assigned") and is kept, last, so the totals add up.
  async structure() {
    const rows = await userRepository.countByStructure()
    const branches = new Map()
    let total = 0
    for (const row of rows) {
      const { branch = '', department = '', subdivision = '' } = row._id
      total += row.count
      if (!branches.has(branch)) branches.set(branch, { name: branch, count: 0, departments: new Map() })
      const b = branches.get(branch)
      b.count += row.count
      if (!b.departments.has(department)) b.departments.set(department, { name: department, count: 0, subdivisions: [] })
      const d = b.departments.get(department)
      d.count += row.count
      if (subdivision) d.subdivisions.push({ name: subdivision, count: row.count })
    }
    const byName = (a, b) => (a.name === '') - (b.name === '') || a.name.localeCompare(b.name)
    return {
      total,
      branches: [...branches.values()]
        .map((b) => ({ ...b, departments: [...b.departments.values()].sort(byName) }))
        .sort(byName),
    }
  },
}
