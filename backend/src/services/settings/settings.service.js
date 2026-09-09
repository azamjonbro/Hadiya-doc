import { Settings, SETTINGS_SECTIONS } from '../../models/settings.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'
import { logger } from '../../config/logger.js'

/**
 * The one settings document, and a cache in front of it.
 *
 * Read on nearly every request that renders a page and written by one
 * screen, which is the shape a cache exists for. Sixty seconds rather than
 * the five minutes course metadata gets: an administrator who changes the
 * company name expects to see it, and waiting five minutes for a setting
 * to take effect is how people conclude the save button is broken.
 */
const CACHE_KEY = 'settings:global'
const CACHE_TTL_SECONDS = 60

/**
 * The document, creating it on first read.
 *
 * Upserted rather than seeded by a migration: a fresh install has no row,
 * and every reader would otherwise have to handle null. The `$setOnInsert`
 * is empty on purpose — the schema defaults fill it, so the defaults live
 * in exactly one place.
 */
async function loadOrCreate() {
  return Settings.findOneAndUpdate(
    { _id: 'global' },
    { $setOnInsert: {} },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()
}

export const settingsService = {
  async get() {
    const cached = await cacheGet(CACHE_KEY)
    if (cached) return cached

    const settings = await loadOrCreate()
    const payload = toPublicSettings(settings)
    await cacheSet(CACHE_KEY, payload, CACHE_TTL_SECONDS)
    return payload
  },

  /**
   * One section's worth, for callers that only need it.
   *
   * Still one cached read of the whole document — the sections are small,
   * and a per-section cache would be seven keys that can disagree.
   */
  async section(name) {
    const settings = await this.get()
    return settings[name] ?? {}
  },

  /**
   * Merges a patch into one or more sections.
   *
   * Section by section rather than a whole-document replace: two
   * administrators on two screens should not overwrite each other's
   * unrelated sections, and a client that omits a field means "leave it",
   * not "clear it".
   */
  async update(actor, payload) {
    const set = {}
    for (const section of SETTINGS_SECTIONS) {
      if (!payload[section]) continue
      for (const [key, value] of Object.entries(payload[section])) {
        if (value === undefined) continue
        set[`${section}.${key}`] = value
      }
    }
    if (!Object.keys(set).length) return this.get()

    set.updatedBy = actor.id
    await Settings.updateOne({ _id: 'global' }, { $set: set }, { upsert: true, runValidators: true })
    await cacheDel(CACHE_KEY)

    await auditLogRepository.record({
      actor: actor.id,
      action: 'SETTINGS_UPDATED',
      entity: 'Settings',
      entityId: 'global',
      // The keys, not the values: a settings diff in the audit log would
      // eventually carry something somebody should not have logged.
      metadata: { fields: Object.keys(set).filter((key) => key !== 'updatedBy') },
    })

    return this.get()
  },

  /** Drops the cache — for a worker that changed settings out of band. */
  async invalidate() {
    await cacheDel(CACHE_KEY).catch((error) => {
      logger.warn('Could not clear the settings cache', { error: error.message })
    })
  },
}

function toPublicSettings(settings) {
  const payload = {}
  for (const section of SETTINGS_SECTIONS) {
    payload[section] = { ...(settings[section] ?? {}) }
  }
  payload.updatedAt = settings.updatedAt ?? null
  return payload
}
