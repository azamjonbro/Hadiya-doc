import { AiChatMessage } from '../models/aiChatMessage.model.js'
import { Assessment } from '../models/assessment.model.js'
import { AttentionPolicy } from '../models/attentionPolicy.model.js'
import { AssessmentAttempt } from '../models/assessmentAttempt.model.js'
import { CourseAssignment } from '../models/courseAssignment.model.js'
import { CourseQuestion } from '../models/courseQuestion.model.js'
import { CourseReview } from '../models/courseReview.model.js'
import { Group } from '../models/group.model.js'
import { Material } from '../models/material.model.js'
import { Notification } from '../models/notification.model.js'
import { PointsLedger } from '../models/pointsLedger.model.js'
import { Quiz } from '../models/quiz.model.js'
import { QuizAttempt } from '../models/quizAttempt.model.js'
import { Topic } from '../models/topic.model.js'
import { Video } from '../models/video.model.js'
import { VideoAnalyticsEvent } from '../models/videoAnalyticsEvent.model.js'
import { VideoProgress } from '../models/videoProgress.model.js'
import { VideoSession } from '../models/videoSession.model.js'

// Every collection that stores a plain `courseId`. Kept as one list so a
// newly added course-scoped collection has exactly one place to be
// registered, instead of being silently left behind as orphaned rows the
// next time a course is hard-deleted.
const COURSE_SCOPED_MODELS = {
  topics: Topic,
  videos: Video,
  assignments: CourseAssignment,
  reviews: CourseReview,
  questions: CourseQuestion,
  materials: Material,
  videoProgress: VideoProgress,
  videoSessions: VideoSession,
  quizzes: Quiz,
  quizAttempts: QuizAttempt,
  assessments: Assessment,
  assessmentAttempts: AssessmentAttempt,
  pointsLedgers: PointsLedger,
  aiChatMessages: AiChatMessage,
  // Only ever matches the course's own override row — the GLOBAL policy has
  // a null courseId and is untouched by any course delete.
  attentionPolicies: AttentionPolicy,
}

export const courseCascadeRepository = {
  // Deletes everything belonging to a course but NOT the course document
  // itself — course.service.js drops that last on purpose, so a failure
  // part-way through leaves the course reachable and the whole delete
  // simply retryable. Mongo runs standalone here, so there is no
  // transaction to lean on instead.
  //
  // `videoIds` has to be collected by the caller before Video rows are
  // deleted: VideoAnalyticsEvent only stores a videoId, so once the videos
  // are gone its rows can no longer be traced back to the course.
  async deleteByCourse(courseId, videoIds) {
    const deleted = {}

    for (const [name, Model] of Object.entries(COURSE_SCOPED_MODELS)) {
      const { deletedCount } = await Model.deleteMany({ courseId })
      deleted[name] = deletedCount
    }

    deleted.analyticsEvents = videoIds.length
      ? (await VideoAnalyticsEvent.deleteMany({ videoId: { $in: videoIds } })).deletedCount
      : 0

    deleted.notifications = (
      await Notification.deleteMany({ relatedEntityType: 'Course', relatedEntityId: courseId.toString() })
    ).deletedCount

    // A group is a container of its own — it loses the course reference
    // but must survive the delete, unlike everything above.
    deleted.groupsUpdated = (
      await Group.updateMany({ courseIds: courseId }, { $pull: { courseIds: courseId } })
    ).modifiedCount

    return deleted
  },
}
