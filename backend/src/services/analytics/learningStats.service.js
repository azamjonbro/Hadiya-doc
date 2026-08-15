import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { videoSessionRepository } from '../../repositories/videoSession.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'

const DAY_MS = 24 * 60 * 60 * 1000

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

// Counts backward from today (or yesterday, so a streak survives until the
// user's next session today) while each preceding day has activity —
// derived entirely from VideoSession rows, never a stored counter.
function computeStreak(dayKeys) {
  const days = new Set(dayKeys)
  if (days.size === 0) return 0

  let cursor = new Date()
  if (!days.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS)
    if (!days.has(dayKey(cursor))) return 0
  }

  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor = new Date(cursor.getTime() - DAY_MS)
  }
  return streak
}

export const learningStatsService = {
  async getForUser(userId) {
    const [progressSummary, dayKeys, assignments] = await Promise.all([
      videoProgressRepository.getLearningSummary(userId),
      videoSessionRepository.listActiveDayKeys(userId),
      courseAssignmentRepository.listByUser(userId),
    ])

    return {
      coursesCompleted: assignments.filter((a) => a.status === 'COMPLETED').length,
      hoursLearned: Math.round((progressSummary.totalWatchedSeconds / 3600) * 10) / 10,
      videosWatched: progressSummary.videosWatched,
      streakDays: computeStreak(dayKeys),
    }
  },
}
