import { ORG_LIST_TYPES } from '@lms/shared'
import { OrgList } from '../../models/orgList.model.js'
import { User } from '../../models/user.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'

// Which field on a user each list feeds. It is also what makes a delete
// refusable: an entry nobody is filed under can go, one that is still on
// someone's record cannot — their department would otherwise stop matching
// any filter.
const USER_FIELD_BY_TYPE = {
  [ORG_LIST_TYPES.POSITION]: 'position',
  [ORG_LIST_TYPES.DEPARTMENT]: 'department',
  [ORG_LIST_TYPES.SUBDIVISION]: 'subdivision',
  [ORG_LIST_TYPES.COUNTRY]: 'country',
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function namesInUse(type) {
  const field = USER_FIELD_BY_TYPE[type]
  return User.distinct(field, { [field]: { $nin: ['', null] } })
}

export const orgListService = {
  /**
   * The union of what was declared and what is actually on people's records.
   * A value typed straight into the employee form before this page existed is
   * a real department whether or not anyone pressed "add", and leaving it out
   * would make the dropdown quietly narrower than the data. Same reasoning as
   * branch.service.js.
   */
  async list(type) {
    const [declared, used] = await Promise.all([
      OrgList.find({ type }).sort({ name: 1 }).lean(),
      namesInUse(type),
    ])

    const byKey = new Map()
    for (const name of used) {
      byKey.set(name.toLowerCase(), { id: null, name, declared: false, inUse: true })
    }
    for (const row of declared) {
      const existing = byKey.get(row.nameKey)
      byKey.set(row.nameKey, {
        id: row._id.toString(),
        // Keep the declared spelling — it is the one an admin chose on purpose.
        name: row.name,
        declared: true,
        inUse: Boolean(existing?.inUse),
      })
    }

    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
  },

  async create(actor, type, name) {
    const trimmed = name.trim()
    const nameKey = trimmed.toLowerCase()

    const existing = await OrgList.findOne({ type, nameKey })
    if (existing) throw ApiError.conflict('This entry already exists', 'ORG_LIST_ENTRY_EXISTS')

    const row = await OrgList.create({ type, name: trimmed, nameKey, createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ORG_LIST_ENTRY_CREATED',
      entity: 'OrgList',
      entityId: row._id.toString(),
      metadata: { type, name: trimmed },
    })

    return { id: row._id.toString(), name: row.name, declared: true, inUse: false }
  },

  async remove(actor, type, id) {
    const row = await OrgList.findById(id)
    if (!row || row.type !== type) throw ApiError.notFound('Entry not found')

    const field = USER_FIELD_BY_TYPE[type]
    const inUse = await User.countDocuments({ [field]: new RegExp(`^${escapeRegex(row.name)}$`, 'i') })
    if (inUse > 0) {
      throw ApiError.conflict(
        `Still assigned to ${inUse} employee${inUse === 1 ? '' : 's'} — move them first`,
        'ORG_LIST_ENTRY_IN_USE',
        { count: inUse }
      )
    }

    await row.deleteOne()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ORG_LIST_ENTRY_DELETED',
      entity: 'OrgList',
      entityId: id,
      metadata: { type, name: row.name },
    })

    return { id, name: row.name }
  },
}
