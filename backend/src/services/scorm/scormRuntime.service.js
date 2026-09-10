import { ScormState } from '../../models/scormState.model.js'
import { courseCompletionService } from '../courses/courseCompletion.service.js'
import { logger } from '../../config/logger.js'
import { meetsPackage, normalizeCmi } from './scormCmi.js'

/**
 * Reading and writing one learner's state inside one package.
 *
 * The raw CMI tree is stored as the content wrote it (scormState.cmi):
 * suspend data is opaque by design, and the content expects every element it
 * set to come back verbatim on resume. The three facts the platform acts on
 * are mirrored into typed fields by scormCmi.js.
 */

export const scormRuntimeService = {
  /** The row, or a blank one shaped the way the player expects. */
  async load(userId, packageRow) {
    const row = await ScormState.findOne({ userId, packageId: packageRow._id })
    if (row) return row
    return ScormState.create({
      userId,
      packageId: packageRow._id,
      courseId: packageRow.courseId,
      topicId: packageRow.topicId,
      cmi: {},
      firstAccessAt: new Date(),
      lastAccessAt: new Date(),
      attempts: 1,
    })
  },

  /**
   * A commit from the running content.
   *
   * The whole CMI map the player holds is sent, not a diff: the SCORM API is
   * a key-value store the content writes into freely, and reconstructing a
   * diff on the client would be one more thing to get wrong. Elements are
   * merged rather than replaced so a commit that carries only what changed
   * still cannot lose the rest.
   */
  async commit(userId, packageRow, { cmi = {}, finished = false } = {}) {
    const row = await this.load(userId, packageRow)

    const merged = { ...(row.cmi ?? {}), ...cmi }
    const normalized = normalizeCmi(packageRow.version, merged)

    row.cmi = merged
    row.completionStatus = normalized.completionStatus
    row.successStatus = normalized.successStatus
    row.scoreRaw = normalized.scoreRaw
    row.scoreMin = normalized.scoreMin
    row.scoreMax = normalized.scoreMax
    // The larger of the two: a session that reports its own time and a
    // total that has not caught up yet must not shrink the number.
    row.totalTimeSeconds = Math.max(row.totalTimeSeconds ?? 0, normalized.totalTimeSeconds)
    row.location = normalized.location || row.location
    row.suspendData = normalized.suspendData || row.suspendData
    row.exitMode = normalized.exitMode || row.exitMode
    row.lastAccessAt = new Date()

    const complete = meetsPackage(normalized, packageRow.masteryScore)
    // Finished stays finished, like every other content type: a learner who
    // re-opens a completed package and quits on the first slide has not
    // un-completed it.
    if (complete && !row.completedAt) row.completedAt = new Date()

    await row.save()

    if (complete || finished) {
      // Best-effort, as at every other call site: the state is saved, and
      // losing the status update is the smaller loss.
      await courseCompletionService.evaluate(userId, packageRow.courseId).catch((error) => {
        logger.warn('Course completion evaluation failed after a SCORM commit', {
          packageId: String(packageRow._id),
          userId: String(userId),
          error: error.message,
        })
      })
    }

    return row
  },
}
