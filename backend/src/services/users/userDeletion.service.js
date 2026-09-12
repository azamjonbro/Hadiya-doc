import { ROLES } from '@lms/shared'
import { User } from '../../models/user.model.js'
import { Group } from '../../models/group.model.js'
import { Session } from '../../models/session.model.js'
import { PushSubscription } from '../../models/pushSubscription.model.js'
import { Notification } from '../../models/notification.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { LessonProgress } from '../../models/lessonProgress.model.js'
import { MaterialProgress } from '../../models/materialProgress.model.js'
import { VideoProgress } from '../../models/videoProgress.model.js'
import { VideoSession } from '../../models/videoSession.model.js'
import { QuizAttempt } from '../../models/quizAttempt.model.js'
import { TestSession } from '../../models/testSession.model.js'
import { AssessmentAttempt } from '../../models/assessmentAttempt.model.js'
import { AssessmentSession } from '../../models/assessmentSession.model.js'
import { ScormState } from '../../models/scormState.model.js'
import { ProctorSnapshot } from '../../models/proctorSnapshot.model.js'
import { FaceProfile } from '../../models/faceProfile.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { OnboardingEnrollment } from '../../models/onboardingEnrollment.model.js'
import { EventRegistration } from '../../models/eventRegistration.model.js'
import { PointsLedger } from '../../models/pointsLedger.model.js'
import { UserBadge } from '../../models/userBadge.model.js'
import { UserCompetency } from '../../models/userCompetency.model.js'
import { KbView } from '../../models/kbView.model.js'
import { NewsView } from '../../models/newsView.model.js'
import { NewsReaction } from '../../models/newsReaction.model.js'
import { AiChatMessage } from '../../models/aiChatMessage.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { emitWebhookEvent } from '../integrations/webhook.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'

/**
 * Deleting an employee for good, as opposed to switching the account off.
 *
 * Deactivation is the everyday act — the person left, their history stays
 * for the reports. This is the other one: a record created by mistake, a
 * duplicate from an import, somebody who asked to be forgotten. It takes
 * the user document and everything that is *theirs alone* — progress,
 * attempts, sessions, notifications, the face template — and leaves what
 * is part of somebody else's record: the comments they wrote, the chat
 * messages people replied to, the audit rows, the certificates already
 * issued (those carry a number somebody may have been given). Reports who
 * pointed at this person as their manager are left without one, and the
 * groups that cached them as a member forget them.
 *
 * SUPERADMIN only, like emptying the trash: an admin can switch somebody
 * off, but there is no undo for this.
 */
const PERSONAL = [
  Session,
  PushSubscription,
  Notification,
  CourseAssignment,
  LessonProgress,
  MaterialProgress,
  VideoProgress,
  VideoSession,
  QuizAttempt,
  TestSession,
  AssessmentAttempt,
  AssessmentSession,
  ScormState,
  ProctorSnapshot,
  FaceProfile,
  PathEnrollment,
  OnboardingEnrollment,
  EventRegistration,
  PointsLedger,
  UserBadge,
  UserCompetency,
  KbView,
  NewsView,
  NewsReaction,
  AiChatMessage,
]

async function wipePersonalData(userId) {
  const removed = {}
  for (const Model of PERSONAL) {
    try {
      const result = await Model.deleteMany({ userId })
      if (result.deletedCount) removed[Model.modelName] = result.deletedCount
    } catch (error) {
      // One collection refusing must not leave the account half-deleted:
      // note it and carry on, the user row still goes.
      logger.warn('Could not wipe personal data', { model: Model.modelName, userId: String(userId), error: error.message })
    }
  }
  await Group.updateMany({ memberIds: userId }, { $pull: { memberIds: userId } })
  await User.updateMany({ managerId: userId }, { $set: { managerId: null } })
  return removed
}

export const userDeletionService = {
  async permanentlyDelete(actor, id) {
    if (actor.roleName !== ROLES.SUPERADMIN) {
      throw ApiError.forbidden('Only a superadmin can delete an employee permanently', 'SUPERADMIN_ONLY')
    }
    if (id === actor.id) {
      throw ApiError.badRequest('You cannot delete your own account', 'SELF_DELETION_FORBIDDEN')
    }
    const user = await User.findById(id)
    if (!user) throw ApiError.notFound('User not found')

    const removed = await wipePersonalData(user._id)
    await User.deleteOne({ _id: user._id })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'USER_DELETED',
      entity: 'User',
      entityId: id,
      metadata: { fullName: user.fullName, jshshir: user.jshshir, removed },
    })
    await emitWebhookEvent('user.deleted', { user: { id, fullName: user.fullName, jshshir: user.jshshir } })

    return { id, removed }
  },

  async bulkDelete(actor, userIds) {
    const wanted = [...new Set(userIds.map(String))]
    const deleted = []
    const failed = []
    for (const id of wanted) {
      try {
        await this.permanentlyDelete(actor, id)
        deleted.push(id)
      } catch (error) {
        failed.push({ id, code: error.code ?? 'FAILED', message: error.message })
      }
    }
    return { requested: wanted.length, deleted: deleted.length, deletedIds: deleted, failed }
  },
}
