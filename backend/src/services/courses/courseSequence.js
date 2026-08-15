import { PERMISSIONS } from '@lms/shared'
import { videoRepository } from '../../repositories/video.repository.js'
import { topicRepository } from '../../repositories/topic.repository.js'
import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Sequential course progression: a lesson opens only once the one before it
 * has been watched to the end.
 *
 * This lives server-side and is checked when a playback token is issued,
 * because that is the only thing standing between a learner and the video
 * bytes. Disabling the row in the sidebar is presentation; a lock that
 * exists only in the sidebar is bypassed by typing the URL.
 */
function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

// Course order is topic order first, then video order inside the topic —
// the same order the curriculum renders, so "the previous lesson" means
// the same thing to the server and to the learner looking at the list.
export async function orderedCourseVideos(courseId, { publishedOnly = true } = {}) {
  const [topics, videos] = await Promise.all([
    topicRepository.listByCourse(courseId),
    videoRepository.listByCourse(courseId),
  ])

  const topicOrderById = new Map(
    topics
      .filter((topic) => !publishedOnly || topic.status === 'PUBLISHED')
      .map((topic) => [topic._id.toString(), topic.order ?? 0])
  )

  return videos
    .filter((video) => topicOrderById.has(video.topicId.toString()))
    .filter((video) => !publishedOnly || video.status === 'PUBLISHED')
    .sort((a, b) => {
      const byTopic = topicOrderById.get(a.topicId.toString()) - topicOrderById.get(b.topicId.toString())
      return byTopic !== 0 ? byTopic : (a.order ?? 0) - (b.order ?? 0)
    })
}

/**
 * videoId -> { locked, blockedBy } for one learner.
 *
 * Only *required* lessons gate what follows: an optional extra video should
 * not be able to wall off the rest of the course. A lesson that is already
 * completed never re-locks, so revisiting earlier material stays possible.
 */
export function computeLockState(orderedVideos, progressByVideoId) {
  const locks = {}
  let blocker = null

  for (const video of orderedVideos) {
    const id = video._id.toString()
    const completed = Boolean(progressByVideoId.get(id)?.completedAt)

    locks[id] = blocker ? { locked: true, blockedBy: blocker.id } : { locked: false, blockedBy: null }

    // The first unfinished required lesson closes everything after it.
    if (!blocker && !completed && video.required !== false) {
      blocker = { id, title: video.title }
    }
  }

  return locks
}

export async function computeLocksForUser(userId, courseId) {
  const [orderedVideos, progressRows] = await Promise.all([
    orderedCourseVideos(courseId),
    videoProgressRepository.listByUserAndCourse(userId, courseId),
  ])
  const progressByVideoId = new Map(progressRows.map((p) => [p.videoId.toString(), p]))
  return computeLockState(orderedVideos, progressByVideoId)
}

// Called before a playback token is minted. Staff bypass it: they have to be
// able to review any lesson without sitting through the course first.
export async function assertVideoUnlocked(actor, video) {
  if (canManageCourses(actor)) return

  const locks = await computeLocksForUser(actor.id, video.courseId)
  const state = locks[video._id.toString()]
  if (state?.locked) {
    throw ApiError.forbidden(
      'Avvalgi darsni to‘liq ko‘rmaguningizcha bu dars ochilmaydi',
      'PREVIOUS_VIDEO_INCOMPLETE'
    )
  }
}
