import { ROLES } from '@lms/shared'
import { userRepository } from '../../repositories/user.repository.js'
import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { logger } from '../../config/logger.js'

// Who counts as "the learner's manager". There is no explicit manager link on
// the user document, so the department is the org structure available here:
// active managers and admins in the same department. Admins are included so a
// department with no manager assigned still reaches someone.
const SUPERVISOR_ROLES = [ROLES.MANAGER, ROLES.ADMIN]

export const attentionReportService = {
  /**
   * Fires once per learner per video, the first time inattention crosses the
   * policy threshold. `inattentionReportedAt` on the progress row is the
   * latch — without it every subsequent 10-second event batch would notify
   * again for the same video.
   *
   * Never throws into the analytics ingest path: a failed notification must
   * not cost the learner their watch progress, so failures are logged and
   * swallowed by the caller.
   */
  async notifyManagersIfNeeded({ user, video, course, progress, policy }) {
    const threshold = policy.notifyManagerAfter
    if (!threshold || threshold <= 0) return false
    if (progress.inattentionReportedAt) return false
    if ((progress.attentionLostCount ?? 0) < threshold) return false

    const supervisors = await userRepository.listActiveByRolesAndDepartment({
      roleNames: SUPERVISOR_ROLES,
      department: user.department ?? '',
    })
    // Notifying the learner about their own inattention is not the point of
    // this, and a manager watching a course themselves would otherwise get it.
    const recipients = supervisors.filter((s) => s._id.toString() !== user._id.toString())

    // Latch before sending: if the send half-fails, the alternative is
    // re-notifying every 10 seconds, which is worse than one lost message.
    await videoProgressRepository.markInattentionReported(user._id, video._id)

    await Promise.all(
      recipients.map((recipient) =>
        notificationService
          .notify({
            userId: recipient._id,
            // Wording matches the other notification types, which are stored
            // in English and localised by the client from `type`.
            type: 'ATTENTION_ALERT',
            title: `Low attention: `,
            message: `${progress.attentionLostCount}× looked away during "${video.title}"${course?.title ? ` (${course.title})` : ''}`,
            relatedEntityType: 'Course',
            relatedEntityId: video.courseId.toString(),
            severity: 'WARNING',
          })
          .catch((error) => logger.warn('Attention alert delivery failed', { error: error.message }))
      )
    )

    return recipients.length > 0
  },
}
