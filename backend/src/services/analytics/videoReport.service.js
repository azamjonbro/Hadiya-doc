import { PERMISSIONS } from '@lms/shared'
import { videoRepository } from '../../repositories/video.repository.js'
import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { videoSessionRepository } from '../../repositories/videoSession.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { ApiError } from '../../utils/ApiError.js'

function toReport(video, user, progress, sessions) {
  const duration = video.duration ?? 0
  const watchedSeconds = progress?.uniqueWatchedSeconds ?? 0
  return {
    video: { id: video._id.toString(), title: video.title, duration },
    user: { id: user._id.toString(), fullName: user.fullName },
    progress: progress?.completionPercent ?? 0,
    watchedSeconds,
    remainingSeconds: Math.max(0, duration - watchedSeconds),
    skippedSeconds: Math.max(0, duration - watchedSeconds),
    totalWatchedSeconds: progress?.totalWatchedSeconds ?? 0,
    playsCount: progress?.playsCount ?? 0,
    pausesCount: progress?.pausesCount ?? 0,
    seeksCount: progress?.seeksCount ?? 0,
    forwardSeekSeconds: progress?.forwardSeekSeconds ?? 0,
    backwardSeekSeconds: progress?.backwardSeekSeconds ?? 0,
    bufferingSeconds: progress?.bufferingSeconds ?? 0,
    // "Detected inactive tab time" — never presented as proof the user
    // didn't watch, per spec §11.
    tabSwitches: progress?.tabSwitches ?? 0,
    hiddenDurationSeconds: progress?.hiddenDurationSeconds ?? 0,
    sessionsCount: progress?.sessionsCount ?? sessions.length,
    firstWatchedAt: progress?.firstWatchedAt ?? null,
    lastWatchedAt: progress?.lastWatchedAt ?? null,
    completed: Boolean(progress?.completedAt),
    completedAt: progress?.completedAt ?? null,
  }
}

function canViewAllAnalytics(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.ANALYTICS_VIEW_ALL))
}

export const videoReportService = {
  async getReport(actor, videoId, targetUserId) {
    const isSelf = actor.id === targetUserId
    if (!isSelf && !canViewAllAnalytics(actor)) {
      throw ApiError.forbidden('Missing required permission: analytics:view:all')
    }

    const [video, user, progress, sessions] = await Promise.all([
      videoRepository.findById(videoId),
      userRepository.findById(targetUserId),
      videoProgressRepository.findByUserAndVideo(targetUserId, videoId),
      videoSessionRepository.listByUserAndVideo(targetUserId, videoId),
    ])

    if (!video) throw ApiError.notFound('Video not found')
    if (!user) throw ApiError.notFound('User not found')

    return toReport(video, user, progress, sessions)
  },
}
