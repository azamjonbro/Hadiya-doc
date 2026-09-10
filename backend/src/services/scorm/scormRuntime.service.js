import { ScormState } from '../../models/scormState.model.js'
import { courseCompletionService } from '../courses/courseCompletion.service.js'
import { logger } from '../../config/logger.js'

/**
 * The SCORM data model, translated into something the platform can act on.
 *
 * Two versions, two vocabularies for the same three facts. 1.2 has one
 * element, `cmi.core.lesson_status`, carrying both "did they finish" and
 * "did they pass"; 2004 splits it into `cmi.completion_status` and
 * `cmi.success_status`. Scores and times move too, and the time formats are
 * not even the same shape. Translating once here — on the way in — means
 * reports, the curriculum row and the completion rule all read the same
 * three fields, whatever the package was exported from.
 *
 * The raw tree is still stored as the content wrote it (scormState.cmi):
 * suspend data is opaque by design and the content expects every element it
 * set to come back verbatim on resume.
 */

const COMPLETION = { completed: 'completed', incomplete: 'incomplete', 'not attempted': 'not attempted' }

/** 1.2: one status for two questions. */
function fromLessonStatus(status) {
  switch (String(status ?? '').toLowerCase()) {
    case 'passed':
      return { completion: 'completed', success: 'passed' }
    case 'completed':
      return { completion: 'completed', success: 'unknown' }
    case 'failed':
      // Failed is an attempt that finished: the content ran to the end and
      // graded it. Whether that counts for the course is the mastery
      // score's business, not this function's.
      return { completion: 'completed', success: 'failed' }
    case 'incomplete':
    case 'browsed':
      return { completion: 'incomplete', success: 'unknown' }
    case 'not attempted':
      return { completion: 'not attempted', success: 'unknown' }
    default:
      return { completion: 'unknown', success: 'unknown' }
  }
}

/** `HHHH:MM:SS.SS` — SCORM 1.2's CMITimespan. */
function parseTimespan12(value) {
  const match = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(String(value ?? '').trim())
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Math.round(Number(match[3]))
}

/** `PT1H2M3.5S` — 2004's ISO 8601 duration, days and all. */
function parseDuration2004(value) {
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    String(value ?? '').trim()
  )
  if (!match) return 0
  const [, years = 0, months = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match
  // Years and months in a session time are a tool bug rather than a fact,
  // but they are cheap to carry and dropping them silently would make a
  // nonsense total look plausible.
  return (
    Number(years) * 365 * 86400 +
    Number(months) * 30 * 86400 +
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Math.round(Number(seconds))
  )
}

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The three facts, read out of whichever elements this version uses.
 *
 * `scaled` (2004, -1..1) is turned into a percentage when raw is missing:
 * a package that only reports a scaled score is otherwise invisible in a
 * report, and 0.8 → 80 is the same number the learner was shown.
 */
export function normalizeCmi(version, cmi = {}) {
  const get = (key) => cmi[key]

  if (version === '2004') {
    const scaled = numberOrNull(get('cmi.score.scaled'))
    const raw = numberOrNull(get('cmi.score.raw'))
    return {
      completionStatus: COMPLETION[String(get('cmi.completion_status') ?? '').toLowerCase()] ?? 'unknown',
      successStatus: ['passed', 'failed'].includes(String(get('cmi.success_status') ?? '').toLowerCase())
        ? String(get('cmi.success_status')).toLowerCase()
        : 'unknown',
      scoreRaw: raw ?? (scaled === null ? null : Math.round(scaled * 100)),
      scoreMin: numberOrNull(get('cmi.score.min')),
      scoreMax: numberOrNull(get('cmi.score.max')) ?? (raw === null && scaled !== null ? 100 : null),
      totalTimeSeconds: parseDuration2004(get('cmi.total_time')) + parseDuration2004(get('cmi.session_time')),
      location: String(get('cmi.location') ?? ''),
      suspendData: String(get('cmi.suspend_data') ?? ''),
      exitMode: String(get('cmi.exit') ?? ''),
    }
  }

  const status = fromLessonStatus(get('cmi.core.lesson_status'))
  return {
    completionStatus: status.completion,
    successStatus: status.success,
    scoreRaw: numberOrNull(get('cmi.core.score.raw')),
    scoreMin: numberOrNull(get('cmi.core.score.min')),
    scoreMax: numberOrNull(get('cmi.core.score.max')),
    totalTimeSeconds:
      parseTimespan12(get('cmi.core.total_time')) + parseTimespan12(get('cmi.core.session_time')),
    location: String(get('cmi.core.lesson_location') ?? ''),
    suspendData: String(get('cmi.suspend_data') ?? ''),
    exitMode: String(get('cmi.core.exit') ?? ''),
  }
}

/**
 * Has this person finished the package, as far as the course is concerned?
 *
 * Completion and success are separate facts and both matter. A package with
 * a mastery score has to be passed, not merely reached the end: a quiz the
 * learner failed reports `completed` in 1.2, and counting that would hand
 * out completion for a failed test — the exact mistake AT-02 is about.
 */
export function meetsPackage(state, masteryScore) {
  if (state.completionStatus !== 'completed') return false
  if (state.successStatus === 'failed') return false

  if (masteryScore === null || masteryScore === undefined) return true
  if (state.successStatus === 'passed') return true
  if (state.scoreRaw === null) {
    // A mastery score with nothing to compare it to: the content said it
    // finished but never reported a score. Trusting the completion is the
    // lesser evil — refusing it would strand every learner of a package
    // whose author set a mastery score and never wired the score up.
    return true
  }
  const max = state.scoreMax && state.scoreMax > 0 ? state.scoreMax : 100
  const min = state.scoreMin ?? 0
  const percent = ((state.scoreRaw - min) / (max - min)) * 100
  return percent >= masteryScore
}

/** The share of the item a partly-finished package is worth, 0..1. */
export function packageShare(state, masteryScore) {
  if (meetsPackage(state, masteryScore)) return 1
  // Anything short of finished counts as nothing, like a video or a test.
  // A package's own idea of progress is not reported through any element we
  // could trust to be filled in — `cmi.progress_measure` is optional and
  // most tools leave it empty.
  return 0
}

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
