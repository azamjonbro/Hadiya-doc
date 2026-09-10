import { ScheduledReport } from '../../models/scheduledReport.model.js'
import { REPORT_TYPES } from './reportData.service.js'
import { exportJobService } from './exportJob.service.js'
import { queueExport } from '../../jobs/exportQueue.js'
import { scopedUserIdsFor } from '../access/actorScope.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'
import { errorMessage } from '../../utils/errorMessage.js'
import { zonedTimeToUtc, zonedDateParts } from '../../utils/timezone.js'

const DAY_MS = 24 * 60 * 60 * 1000
// A year and a bit: enough for any monthly day to come round, and a bound so
// a cadence nobody anticipated cannot spin forever.
const SEARCH_DAYS = 400

/**
 * When this schedule should next run, as a UTC instant.
 *
 * Found by walking forward a day at a time rather than by month arithmetic.
 * Stepping is obviously correct and costs at most 31 iterations; month
 * arithmetic is where "the 31st of February" and the day a clock changes
 * both hide.
 */
export function computeNextRun(schedule, from = new Date()) {
  const timezone = env.APP_TIMEZONE
  const today = zonedDateParts(from, timezone)

  for (let offset = 0; offset <= SEARCH_DAYS; offset += 1) {
    // Midday, so stepping days never lands on a missing or doubled hour.
    const probe = new Date(
      zonedTimeToUtc({ ...today, hour: 12 }, timezone).getTime() + offset * DAY_MS
    )
    const parts = zonedDateParts(probe, timezone)

    const matches =
      schedule.cadence === 'DAILY' ||
      (schedule.cadence === 'WEEKLY' && parts.weekday === schedule.dayOfWeek) ||
      (schedule.cadence === 'MONTHLY' && parts.day === schedule.dayOfMonth)
    if (!matches) continue

    const candidate = zonedTimeToUtc({ ...parts, hour: schedule.hour }, timezone)
    // Strictly after, or a schedule that just ran would immediately be due
    // again and the sweep would build it in a loop.
    if (candidate > from) return candidate
  }

  // Unreachable for the three cadences above; a bound has to answer with
  // something rather than with undefined.
  return new Date(from.getTime() + SEARCH_DAYS * DAY_MS)
}

function assertKnownType(type) {
  if (!REPORT_TYPES.includes(type)) {
    throw ApiError.badRequest('Unknown report type', 'UNKNOWN_REPORT_TYPE')
  }
}

function toPublic(schedule) {
  return {
    id: String(schedule._id),
    name: schedule.name,
    type: schedule.type,
    format: schedule.format,
    lang: schedule.lang,
    filters: schedule.filters ?? {},
    cadence: schedule.cadence,
    hour: schedule.hour,
    dayOfWeek: schedule.dayOfWeek,
    dayOfMonth: schedule.dayOfMonth,
    recipients: (schedule.recipients ?? []).map(String),
    active: schedule.active,
    lastRunAt: schedule.lastRunAt,
    lastJobId: schedule.lastJobId ? String(schedule.lastJobId) : null,
    lastError: schedule.lastError ?? '',
    nextRunAt: schedule.nextRunAt,
    createdAt: schedule.createdAt,
  }
}

/**
 * Recipients, filtered to the ones still allowed to have the file.
 *
 * Checked at delivery rather than only at creation: a schedule outlives the
 * roles of the people on it, and somebody who has moved on from a job that
 * needed the staff list should stop receiving it without anybody having to
 * remember to edit the schedule.
 */
async function eligibleRecipients(ids) {
  if (!ids?.length) return []
  const users = await userRepository.findByIds(ids.map(String))
  return users.filter((user) => user.isActive)
}

export const scheduledReportService = {
  /**
   * Writes a failed build back onto the schedule that asked for it.
   *
   * Called by the export worker. Without it a scheduled report could fail
   * every week — a bad filter, a storage outage — while its row went on
   * saying it last ran successfully, because the failure happened in a job
   * the schedule had already stopped watching.
   */
  async recordJobFailure(scheduleId, message) {
    if (!scheduleId) return null
    return ScheduledReport.findByIdAndUpdate(scheduleId, { $set: { lastError: message } })
  },

  async create(actor, payload) {
    assertKnownType(payload.type)
    const draft = { ...payload, createdBy: actor.id }
    const schedule = await ScheduledReport.create({
      ...draft,
      nextRunAt: computeNextRun(draft),
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'REPORT_SCHEDULE_CREATED',
      entity: 'ScheduledReport',
      entityId: String(schedule._id),
      metadata: { type: schedule.type, cadence: schedule.cadence, recipients: schedule.recipients.length },
    })

    return toPublic(schedule)
  },

  async list(actor) {
    const rows = await ScheduledReport.find({ createdBy: actor.id }).sort({ createdAt: -1 }).lean()
    return { items: rows.map(toPublic) }
  },

  async get(actor, id) {
    const schedule = await ScheduledReport.findById(id).lean()
    if (!schedule) throw ApiError.notFound('Schedule not found')
    // A schedule carries a saved filter and an audience; it is its owner's.
    if (String(schedule.createdBy) !== String(actor.id)) throw ApiError.forbidden('Not your schedule')
    return toPublic(schedule)
  },

  async update(actor, id, patch) {
    const schedule = await ScheduledReport.findById(id)
    if (!schedule) throw ApiError.notFound('Schedule not found')
    if (String(schedule.createdBy) !== String(actor.id)) throw ApiError.forbidden('Not your schedule')
    if (patch.type) assertKnownType(patch.type)

    Object.assign(schedule, patch)
    // Recomputed on every edit: changing the hour or the cadence without
    // moving nextRunAt would leave the schedule firing on the old timetable
    // until it happened to run once.
    schedule.nextRunAt = computeNextRun(schedule)
    await schedule.save()

    await auditLogRepository.record({
      actor: actor.id,
      action: 'REPORT_SCHEDULE_UPDATED',
      entity: 'ScheduledReport',
      entityId: String(schedule._id),
      metadata: { fields: Object.keys(patch) },
    })

    return toPublic(schedule)
  },

  async remove(actor, id) {
    const schedule = await ScheduledReport.findById(id)
    if (!schedule) throw ApiError.notFound('Schedule not found')
    if (String(schedule.createdBy) !== String(actor.id)) throw ApiError.forbidden('Not your schedule')
    await schedule.deleteOne()

    await auditLogRepository.record({
      actor: actor.id,
      action: 'REPORT_SCHEDULE_DELETED',
      entity: 'ScheduledReport',
      entityId: String(id),
      metadata: { type: schedule.type },
    })

    return { deleted: true }
  },

  /**
   * Builds one schedule's export now.
   *
   * The scope is the *owner's*, resolved at build time and stored on the job
   * exactly as a hand-queued export would (8.3). A schedule must not become
   * a way to see more than the person who created it can: they are not at a
   * keyboard when it runs, so there is nobody to check it against but them.
   */
  async runOnce(schedule, { now = new Date() } = {}) {
    // Checked again here, not only when the schedule was written. A report
    // type can be removed after a schedule referring to it exists, and
    // without this the sweep queues a job that fails in the worker minutes
    // later — where nothing connects the failure back to the timetable that
    // caused it, so the schedule keeps reporting success forever.
    assertKnownType(schedule.type)

    const owner = { id: String(schedule.createdBy) }
    const scopedUserIds = await scopedUserIdsFor(owner)

    const job = await exportJobService.create(owner, {
      type: schedule.type,
      format: schedule.format,
      lang: schedule.lang,
      filters: schedule.filters ?? {},
      scopedUserIds,
      scheduleId: schedule._id,
      // Everyone who should hear about it, checked now rather than when the
      // schedule was written.
      notify: (await eligibleRecipients(schedule.recipients)).map((user) => String(user._id)),
    })
    await queueExport(job._id)

    schedule.lastRunAt = now
    schedule.lastJobId = job._id
    schedule.lastError = ''
    schedule.nextRunAt = computeNextRun(schedule, now)
    await schedule.save()

    return job
  },

  /**
   * The sweep. Runs hourly; builds everything that has come due.
   *
   * A schedule that throws is recorded and moved on from rather than
   * retried: the next run is an hour or a day away, and a report that
   * cannot be built now is very unlikely to build on a retry thirty seconds
   * later. What must not happen is one broken schedule stopping the others.
   */
  async runDue({ now = new Date() } = {}) {
    const due = await ScheduledReport.find({ active: true, nextRunAt: { $lte: now } })

    let built = 0
    let failed = 0
    for (const schedule of due) {
      try {
        await this.runOnce(schedule, { now })
        built += 1
      } catch (error) {
        failed += 1
        schedule.lastError = errorMessage(error, 'The scheduled report could not be built')
        // Advanced anyway, or a schedule that fails once is retried on every
        // sweep for ever.
        schedule.nextRunAt = computeNextRun(schedule, now)
        await schedule.save().catch(() => {})
        logger.error('Scheduled report failed', {
          scheduleId: String(schedule._id),
          error: schedule.lastError,
        })
      }
    }

    if (due.length) logger.info('Scheduled report sweep completed', { due: due.length, built, failed })
    return { due: due.length, built, failed }
  },
}
