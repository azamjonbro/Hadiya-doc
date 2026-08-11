import { videoRepository } from '../repositories/video.repository.js'
import { videoProgressRepository } from '../repositories/videoProgress.repository.js'
import { videoSessionRepository } from '../repositories/videoSession.repository.js'
import { videoAnalyticsEventRepository } from '../repositories/videoAnalyticsEvent.repository.js'
import { mergeSegments, sumSegmentSeconds } from './watchedSegments.js'
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
      default:
        break
    }
  }

  const mergedSegments = mergeSegments(progress.watchedSegments, newIntervals)
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
    firstWatchedAt: progress.firstWatchedAt ?? sessionStart,
    lastWatchedAt: sessionEnd ?? progress.lastWatchedAt,
    completedAt: isNewlyCompleted ? new Date() : progress.completedAt,
  })

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
