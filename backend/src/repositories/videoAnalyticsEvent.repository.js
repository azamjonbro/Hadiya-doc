import { VideoAnalyticsEvent } from '../models/videoAnalyticsEvent.model.js'

export const videoAnalyticsEventRepository = {
  /**
   * Inserts a batch and reports **which events were new** (12.3).
   *
   * `ordered: false` keeps going past a duplicate instead of stopping at
   * it, and the duplicate-key errors name the indexes of the events that
   * were already stored. That is the whole dedupe mechanism: a replayed
   * offline queue inserts nothing the second time, and the caller counts
   * only what it actually inserted — so five minutes watched offline adds
   * 300 seconds however many times the queue is flushed (AT-35).
   *
   * @returns {Promise<{ inserted: object[], duplicates: object[] }>}
   */
  async insertMany(events) {
    if (!events.length) return { inserted: [], duplicates: [] }
    try {
      await VideoAnalyticsEvent.insertMany(events, { ordered: false })
      return { inserted: events, duplicates: [] }
    } catch (error) {
      // A bulk write that hit duplicates: `writeErrors` carries the index
      // of each event that was rejected. Anything else is a real failure.
      const writeErrors = error?.writeErrors ?? error?.result?.result?.writeErrors ?? []
      const duplicateIndexes = new Set(
        writeErrors.filter((entry) => (entry.err?.code ?? entry.code) === 11000).map((entry) => entry.index ?? entry.err?.index)
      )
      if (!duplicateIndexes.size) throw error

      const inserted = events.filter((_, index) => !duplicateIndexes.has(index))
      const duplicates = events.filter((_, index) => duplicateIndexes.has(index))
      // Every error was a duplicate, so nothing here is being swallowed:
      // the count of write errors matches the duplicates found.
      if (writeErrors.length !== duplicateIndexes.size) throw error
      return { inserted, duplicates }
    }
  },
}
