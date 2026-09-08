import { auditLogRepository } from '../../repositories/auditLog.repository.js'

// Metadata is written by ~70 different call sites and can hold anything the
// action found worth recording — a filter object, a row count, a filename.
// The list view renders it as one compact string rather than a nested tree:
// the column exists so an admin can tell two rows of the same action apart,
// and the full object is one click away in the row's detail panel.
function summarizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return ''
  return Object.entries(metadata)
    .map(([key, value]) => {
      if (value === null || value === undefined) return `${key}=—`
      if (typeof value === 'object') return `${key}=${JSON.stringify(value)}`
      return `${key}=${value}`
    })
    .join(' · ')
}

function serialize(row) {
  return {
    id: row._id.toString(),
    // A deleted user leaves their entries behind on purpose — the point of an
    // audit log is that it outlives the account. `actor` is then null, and the
    // row still carries the action, the time and the IP.
    actor: row.actor
      ? { id: row.actor._id.toString(), fullName: row.actor.fullName, email: row.actor.email ?? '' }
      : null,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    metadata: row.metadata ?? {},
    ip: row.ip ?? '',
    userAgent: row.userAgent ?? '',
    timestamp: row.timestamp,
  }
}

function toParams(query) {
  return {
    actor: query.actor,
    action: query.action,
    entity: query.entity,
    entityId: query.entityId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    page: query.page,
    limit: query.limit,
  }
}

export const auditLogService = {
  async list(query) {
    const params = toParams(query)
    const [rows, total] = await Promise.all([
      auditLogRepository.listPage(params),
      auditLogRepository.count(params),
    ])

    return {
      items: rows.map(serialize),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    }
  },

  // Both filter dropdowns come from the data itself, so an action added in a
  // later release shows up without anyone updating a list here.
  async filterOptions() {
    const actions = await auditLogRepository.distinctActions()
    return { actions: actions.sort() }
  },

  // Yields CSV lines, header first. A generator rather than a returned string
  // because the caller writes them to the response as they arrive — an export
  // of a busy quarter is far too large to assemble in memory first.
  async *exportCsv(query) {
    const columns = ['timestamp', 'actor', 'action', 'entity', 'entityId', 'metadata', 'ip', 'userAgent']
    // Leading BOM so Excel reads the UTF-8 (Cyrillic names, Uzbek titles)
    // instead of mangling it — same as the report exports.
    yield '﻿' + columns.join(',') + '\r\n'

    for await (const row of auditLogRepository.streamAll(toParams(query))) {
      const values = [
        new Date(row.timestamp).toISOString(),
        row.actor?.fullName ?? '',
        row.action,
        row.entity,
        row.entityId ?? '',
        summarizeMetadata(row.metadata),
        row.ip ?? '',
        row.userAgent ?? '',
      ]
      yield values.map(escapeCsvValue).join(',') + '\r\n'
    }
  },
}

function escapeCsvValue(value) {
  const str = String(value ?? '')
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}
