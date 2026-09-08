import { videoRepository } from '../repositories/video.repository.js'
import { videoProgressRepository } from '../repositories/videoProgress.repository.js'
import { videoSessionRepository } from '../repositories/videoSession.repository.js'
import { videoAnalyticsEventRepository } from '../repositories/videoAnalyticsEvent.repository.js'
import { courseAssignmentRepository } from '../repositories/courseAssignment.repository.js'
import { courseRepository } from '../repositories/course.repository.js'
import { userRepository } from '../repositories/user.repository.js'
import { ATTENTION_EVENTS } from '@lms/shared'
import { mergeSegments, subtractSegments, sumSegmentSeconds } from './watchedSegments.js'
import { pointsService } from '../services/gamification/points.service.js'
import { attentionPolicyService } from '../services/courses/attentionPolicy.service.js'
import { attentionReportService } from '../services/courses/attentionReport.service.js'
import { notificationService } from '../services/notifications/notification.service.js'
import { logger } from '../config/logger.js'
import { ApiError } from '../utils/ApiError.js'

const COMPLETION_THRESHOLD = 0.9

const EMPTY_PROGRESS = {
  watchedSegments: [],
  totalWatchedSeconds: 0,
  playsCount: 0,
  pausesCount: 0,
  seeksCount: 0,
  forwardSeekSeconds: 0,
  backwardSeekSeconds: 0,
  bufferingSeconds: 0,
  tabSwitches: 0,
  hiddenDurationSeconds: 0,
  sessionsCount: 0,
  attentionLostCount: 0,
  inattentiveSeconds: 0,
  attentionWarnings: 0,
  attentionLockouts: 0,
  cameraBlocked: false,
  inattentionReportedAt: null,
  firstWatchedAt: null,
  lastWatchedAt: null,
  completedAt: null,
}

export async function processVideoEvents({ userId, sessionId, videoId, events, device, browser }) {
  const video = await videoRepository.findById(videoId)
  if (!video) throw ApiError.notFound('Video not found')

  // Raw events, bulk-inserted — never one write per event (spec §8).
  await videoAnalyticsEventRepository.insertMany(
    events.map((e) => ({
      userId,
      sessionId,
      videoId,
      eventType: e.eventType,
      timestamp: new Date(e.timestamp),
      position: e.position ?? null,
      duration: e.duration ?? null,
      metadata: e.metadata ?? {},
      device,
      browser,
    }))
  )

  const progress = (await videoProgressRepository.findByUserAndVideo(userId, videoId)) ?? EMPTY_PROGRESS
  const existingSession = await videoSessionRepository.findBySessionId(sessionId)
  const isNewSession = !existingSession

  const newIntervals = []
  let playsDelta = 0
  let pausesDelta = 0
  let seeksDelta = 0
  let forwardSeekDelta = 0
  let backwardSeekDelta = 0
  let bufferingDelta = 0
  let tabSwitchesDelta = 0
  let hiddenDurationDelta = 0
  let totalWatchedDelta = 0
  let sessionStart = null
  let sessionEnd = null
  let sessionActiveDuration = 0
  let sessionHiddenDuration = 0
  let attentionLostDelta = 0
  let inattentiveSecondsDelta = 0
  let warningsDelta = 0
  let lockoutsDelta = 0
  let cameraBlocked = false
  // Video-position ranges the learner was looking away for, cut out of the
  // watched segments further down.
  const inattentiveIntervals = []

  for (const event of events) {
    const at = new Date(event.timestamp)
    if (!sessionStart || at < sessionStart) sessionStart = at
    if (!sessionEnd || at > sessionEnd) sessionEnd = at

    switch (event.eventType) {
      case 'play':
      case 'resume':
        playsDelta += 1
        break
      case 'pause':
        pausesDelta += 1
        break
      case 'seek':
      case 'seeked': {
        seeksDelta += 1
        const from = event.metadata?.from
        const to = event.metadata?.to
        if (typeof from === 'number' && typeof to === 'number') {
          if (to > from) forwardSeekDelta += to - from
          else backwardSeekDelta += from - to
        }
        break
      }
      case 'buffering':
      case 'waiting':
        bufferingDelta += event.duration ?? 0
        break
      case 'tabHidden':
        tabSwitchesDelta += 1
        break
      case 'tabVisible':
        hiddenDurationDelta += event.duration ?? 0
        sessionHiddenDuration += event.duration ?? 0
        break
      case 'progress':
        // A played interval built client-side from real timeupdate deltas
        // while actually playing — the only thing that feeds completion.
        if (typeof event.position === 'number' && typeof event.duration === 'number' && event.duration > 0) {
          newIntervals.push({ start: event.position, end: event.position + event.duration })
          totalWatchedDelta += event.duration
          sessionActiveDuration += event.duration
        }
        break
      case ATTENTION_EVENTS.LOST:
        attentionLostDelta += 1
        break
      case ATTENTION_EVENTS.REGAINED: {
        // Carries the video-position range the learner missed. `duration` is
        // wall-clock seconds spent looking away, which is not the same number
        // once the player pauses itself — both are worth keeping.
        inattentiveSecondsDelta += event.duration ?? 0
        const from = event.metadata?.fromPosition
        const to = event.metadata?.toPosition
        if (typeof from === 'number' && typeof to === 'number' && to > from) {
          inattentiveIntervals.push({ start: from, end: to })
        }
        break
      }
      case ATTENTION_EVENTS.WARNING_SHOWN:
        warningsDelta += 1
        break
      case ATTENTION_EVENTS.LOCKOUT:
        lockoutsDelta += 1
        break
      case ATTENTION_EVENTS.CAMERA_DENIED:
      case ATTENTION_EVENTS.CAMERA_ERROR:
        // Sticky: once a session went unmonitored, the completion record for
        // this video can never claim the learner was watched throughout.
        cameraBlocked = true
        break
      default:
        break
    }
  }

  // Merge first, then punch out the inattentive ranges: the seconds the
  // learner looked away arrived as ordinary `progress` events in this very
  // batch, so they are already inside the merged set by the time they can be
  // removed. Re-watching the range later heals it, since a fresh progress
  // interval merges back over the hole and nothing re-subtracts it.
  const policy = await attentionPolicyService.getEffectiveForCourse(video.courseId.toString())
  const merged = mergeSegments(progress.watchedSegments, newIntervals)
  const mergedSegments =
    policy.requireRewatch && inattentiveIntervals.length ? subtractSegments(merged, inattentiveIntervals) : merged
  const uniqueWatchedSeconds = sumSegmentSeconds(mergedSegments)
  const completionPercent =
    video.duration > 0 ? Math.min(100, Math.round((uniqueWatchedSeconds / video.duration) * 1000) / 10) : 0
  const isNewlyCompleted =
    !progress.completedAt && video.duration > 0 && uniqueWatchedSeconds / video.duration >= COMPLETION_THRESHOLD

  const updated = await videoProgressRepository.upsert(userId, videoId, video.courseId, {
    watchedSegments: mergedSegments,
    uniqueWatchedSeconds,
    totalWatchedSeconds: progress.totalWatchedSeconds + totalWatchedDelta,
    completionPercent,
    playsCount: progress.playsCount + playsDelta,
    pausesCount: progress.pausesCount + pausesDelta,
    seeksCount: progress.seeksCount + seeksDelta,
    forwardSeekSeconds: progress.forwardSeekSeconds + forwardSeekDelta,
    backwardSeekSeconds: progress.backwardSeekSeconds + backwardSeekDelta,
    bufferingSeconds: progress.bufferingSeconds + bufferingDelta,
    tabSwitches: progress.tabSwitches + tabSwitchesDelta,
    hiddenDurationSeconds: progress.hiddenDurationSeconds + hiddenDurationDelta,
    sessionsCount: progress.sessionsCount + (isNewSession ? 1 : 0),
    attentionLostCount: (progress.attentionLostCount ?? 0) + attentionLostDelta,
    inattentiveSeconds: (progress.inattentiveSeconds ?? 0) + inattentiveSecondsDelta,
    attentionWarnings: (progress.attentionWarnings ?? 0) + warningsDelta,
    attentionLockouts: (progress.attentionLockouts ?? 0) + lockoutsDelta,
    cameraBlocked: Boolean(progress.cameraBlocked) || cameraBlocked,
    firstWatchedAt: progress.firstWatchedAt ?? sessionStart,
    lastWatchedAt: sessionEnd ?? progress.lastWatchedAt,
    completedAt: isNewlyCompleted ? new Date() : progress.completedAt,
  })

  // Escalate to the learner's manager once inattention passes the policy
  // threshold. Deliberately never allowed to fail the ingest: losing an alert
  // is recoverable, losing the batch of watch progress that came with it is
  // not.
  if (attentionLostDelta > 0) {
    try {
      const learner = await userRepository.findById(userId)
      if (learner) {
        await attentionReportService.notifyManagersIfNeeded({
          user: learner,
          video,
          course: await courseRepository.findById(video.courseId),
          progress: updated,
          policy,
        })
      }
    } catch (error) {
      logger.warn('Attention alert check failed', { error: error.message, videoId: String(videoId) })
    }
  }

  // Videos with a quiz attached only pay out points on a passing quiz
  // submission (see quiz.service.js) — watching alone isn't enough once a
  // test is required.
  if (isNewlyCompleted && !video.hasQuiz && video.pointsEnabled) {
    await pointsService.award(userId, videoId, video.courseId, video.points, 'COMPLETION')
  }

  // Finishing the last video in the course is the only place course-level
  // completion gets decided — nothing else ever flips an assignment out of
  // ACTIVE, so without this a course can be fully watched and still show as
  // "in progress" forever.
  if (isNewlyCompleted) {
    const [courseVideos, courseProgressRows] = await Promise.all([
      videoRepository.listByCourse(video.courseId),
      videoProgressRepository.listByUserAndCourse(userId, video.courseId),
    ])
    const publishedVideoIds = courseVideos.filter((v) => v.status === 'PUBLISHED').map((v) => v._id.toString())
    const completedVideoIds = new Set(
      courseProgressRows.filter((p) => p.completedAt).map((p) => p.videoId.toString())
    )
    const allCompleted = publishedVideoIds.length > 0 && publishedVideoIds.every((id) => completedVideoIds.has(id))

    if (allCompleted) {
      const assignment = await courseAssignmentRepository.findByUserAndCourse(userId, video.courseId)
      if (assignment && assignment.status === 'ACTIVE') {
        await courseAssignmentRepository.updateById(assignment._id, { status: 'COMPLETED' })
        // Inside the ACTIVE check on purpose: the transition happens once,
        // so the congratulation does too. Re-watching a finished course must
        // not send it again.
        try {
          const course = await courseRepository.findById(video.courseId)
          await notificationService.notify({
            userId,
            type: 'COURSE_COMPLETED',
            vars: { courseTitle: course?.title ?? '' },
            relatedEntityType: 'Course',
            relatedEntityId: String(video.courseId),
          })
        } catch (error) {
          // The completion is already recorded; losing the notification is
          // strictly better than losing that.
          logger.warn('Could not send the course-completed notification', {
            userId: String(userId),
            courseId: String(video.courseId),
            error: error.message,
          })
        }
      }
    }
  }

  if (sessionStart && sessionEnd) {
    await videoSessionRepository.upsert(sessionId, {
      userId,
      courseId: video.courseId,
      topicId: video.topicId,
      videoId,
      startedAt: existingSession?.startedAt ?? sessionStart,
      endedAt: sessionEnd,
      activeDuration: (existingSession?.activeDuration ?? 0) + sessionActiveDuration,
      hiddenDuration: (existingSession?.hiddenDuration ?? 0) + sessionHiddenDuration,
      watchedDuration: (existingSession?.watchedDuration ?? 0) + totalWatchedDelta,
      completed: Boolean(updated.completedAt),
      device,
      browser,
    })
  }

  return { completionPercent, completed: Boolean(updated.completedAt) }
}
