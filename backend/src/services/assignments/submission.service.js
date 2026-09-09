import { Assignment } from '../../models/assignment.model.js'
import { Submission } from '../../models/submission.model.js'
import { Rubric } from '../../models/rubric.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Handing work in, and marking it.
 *
 * Two rules shape everything here.
 *
 * A submission is never edited in place. Each attempt is its own row, so
 * the reviewer-returns-it / learner-fixes-it cycle keeps both what was
 * wrong and the fact that it was corrected. Overwriting would leave a
 * graded assignment whose content no longer matches the grade.
 *
 * Lateness is decided once, at submission time. Recomputing it on read
 * means extending a deadline retroactively un-lates everybody's work, and
 * shortening one makes punctual submissions late — in both cases changing
 * a fact about the past by editing the future.
 */

const HOUR_MS = 60 * 60 * 1000

function deadlineState(assignment, now = new Date()) {
  if (!assignment.dueAt) return { late: false, closed: false }
  const due = new Date(assignment.dueAt)
  if (now <= due) return { late: false, closed: false }
  if (!assignment.allowLate) return { late: true, closed: true }
  // A window of 0 with allowLate on means "late for ever" — the deadline
  // is advisory, which is a real policy and the one a reviewer picks when
  // they want the date visible but not enforced.
  if (!assignment.lateWindowHours) return { late: true, closed: false }
  const closesAt = new Date(due.getTime() + assignment.lateWindowHours * HOUR_MS)
  return { late: true, closed: now > closesAt }
}

export const submissionService = {
  /** The learner's own attempts at one assignment. */
  async mine(actor, assignmentId) {
    const assignment = await Assignment.findById(assignmentId).lean()
    if (!assignment) throw ApiError.notFound('Assignment not found')

    const attempts = await Submission.find({ assignmentId, userId: actor.id }).sort({ attemptNo: 1 }).lean()
    const state = deadlineState(assignment)

    return {
      assignment: toPublicAssignment(assignment),
      canSubmit:
        !state.closed &&
        (assignment.maxAttempts === 0 ||
          attempts.filter((row) => row.status !== 'DRAFT').length < assignment.maxAttempts),
      late: state.late,
      closed: state.closed,
      attempts: attempts.map(toPublicSubmission),
    }
  },

  /**
   * Saves a draft, or hands it in.
   *
   * A draft is one row that keeps being rewritten — it is not an attempt
   * yet, and counting it against the attempt limit would punish somebody
   * for saving their work.
   */
  async save(actor, assignmentId, payload, { submit = false } = {}) {
    const assignment = await Assignment.findById(assignmentId).lean()
    if (!assignment) throw ApiError.notFound('Assignment not found')
    if (assignment.status !== 'PUBLISHED') throw ApiError.notFound('Assignment not found')

    const state = deadlineState(assignment)
    if (submit && state.closed) {
      throw ApiError.badRequest('This assignment is closed for submissions', 'ASSIGNMENT_CLOSED')
    }

    const draft = await Submission.findOne({ assignmentId, userId: actor.id, status: 'DRAFT' })
    const finished = await Submission.countDocuments({
      assignmentId,
      userId: actor.id,
      status: { $ne: 'DRAFT' },
    })

    if (submit && assignment.maxAttempts > 0 && finished >= assignment.maxAttempts) {
      throw ApiError.conflict('You have used every attempt at this assignment', 'ATTEMPTS_EXHAUSTED')
    }

    const fields = {
      text: payload.text ?? '',
      files: payload.files ?? [],
      links: payload.links ?? [],
    }

    if (!submit) {
      const row = draft
        ? Object.assign(draft, fields)
        : new Submission({ assignmentId, userId: actor.id, attemptNo: finished + 1, ...fields })
      await row.save()
      return toPublicSubmission(row.toObject())
    }

    const submission =
      draft ?? new Submission({ assignmentId, userId: actor.id, attemptNo: finished + 1 })
    Object.assign(submission, fields, {
      // Numbered at submission, not at draft creation: a draft written
      // before an earlier attempt was graded would otherwise claim a
      // number that attempt already took.
      attemptNo: finished + 1,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      late: state.late,
      // A resubmission clears the previous verdict — the score belonged to
      // the work that has just been replaced.
      score: null,
      feedback: '',
      rubricScores: [],
      gradedBy: null,
      gradedAt: null,
    })

    try {
      await submission.save()
    } catch (error) {
      // Two tabs submitting at once both computed the same attempt number;
      // the unique index decides which one wrote it (the same trick as
      // AT-06 on quiz attempts).
      if (error.code === 11000) {
        throw ApiError.conflict('That attempt was already submitted', 'ATTEMPT_CONFLICT')
      }
      throw error
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'ASSIGNMENT_SUBMITTED',
      entity: 'Assignment',
      entityId: String(assignmentId),
      metadata: { attemptNo: submission.attemptNo, late: submission.late },
    })

    await this.notifyReviewers(assignment, actor).catch((error) => {
      logger.warn('Could not tell the reviewers about a submission', { error: error.message })
    })

    return toPublicSubmission(submission.toObject())
  },

  /** Tells whoever has to mark it that there is something to mark. */
  async notifyReviewers(assignment, actor) {
    // Named reviewers only. With none named the work sits in the queue,
    // which is where anybody with the permission looks anyway — mailing
    // every grader in the company for every submission is how a queue
    // notification becomes something people filter out.
    for (const reviewerId of assignment.reviewerIds ?? []) {
      await notificationService
        .notify({
          userId: reviewerId,
          type: 'ASSIGNMENT_SUBMITTED',
          vars: { assignmentTitle: assignment.title, userName: actor.fullName ?? '' },
          relatedEntityType: 'Assignment',
          relatedEntityId: String(assignment._id),
        })
        .catch(() => null)
    }
  },

  /**
   * The grading queue.
   *
   * Oldest first, deliberately: a queue sorted newest-first leaves the
   * oldest submission waiting for ever, which is the one whose author has
   * already asked twice where their mark is.
   */
  async queue(actor, { courseId, assignmentId, limit = 50 } = {}) {
    const filter = { status: 'SUBMITTED' }
    if (assignmentId) filter.assignmentId = assignmentId
    else if (courseId) {
      const ids = await Assignment.find({ courseId }, { _id: 1 }).lean()
      filter.assignmentId = { $in: ids.map((row) => row._id) }
    }

    const rows = await Submission.find(filter)
      .sort({ submittedAt: 1 })
      .limit(limit)
      .populate('userId', 'fullName department')
      .populate('assignmentId', 'title courseId maxScore reviewerIds')
      .lean()

    // A named reviewer sees their own queue; with nobody named it is
    // everybody's.
    const mine = rows.filter((row) => {
      const reviewers = row.assignmentId?.reviewerIds ?? []
      return reviewers.length === 0 || reviewers.some((id) => String(id) === String(actor.id))
    })

    return {
      items: mine.map((row) => ({
        id: String(row._id),
        assignmentId: String(row.assignmentId?._id ?? row.assignmentId),
        assignmentTitle: row.assignmentId?.title ?? '',
        courseId: row.assignmentId?.courseId ? String(row.assignmentId.courseId) : null,
        maxScore: row.assignmentId?.maxScore ?? 100,
        userId: String(row.userId?._id ?? row.userId),
        fullName: row.userId?.fullName ?? '',
        department: row.userId?.department ?? '',
        attemptNo: row.attemptNo,
        submittedAt: row.submittedAt,
        late: row.late,
      })),
    }
  },

  /** One submission, with everything the reviewer needs to mark it. */
  async detail(actor, submissionId) {
    const submission = await Submission.findById(submissionId)
      .populate('userId', 'fullName department')
      .lean()
    if (!submission) throw ApiError.notFound('Submission not found')

    const assignment = await Assignment.findById(submission.assignmentId).lean()
    const rubric = assignment?.rubricId ? await Rubric.findById(assignment.rubricId).lean() : null

    const isOwner = String(submission.userId?._id ?? submission.userId) === String(actor.id)
    const canGrade = actor.permissions?.includes('quiz:grade') || actor.permissions?.includes('course:update')
    if (!isOwner && !canGrade) throw ApiError.forbidden('Not your submission')

    return {
      ...toPublicSubmission(submission),
      fullName: submission.userId?.fullName ?? '',
      assignment: assignment ? toPublicAssignment(assignment) : null,
      rubric: rubric
        ? {
            id: String(rubric._id),
            name: rubric.name,
            criteria: rubric.criteria.map((criterion) => ({
              id: String(criterion._id),
              label: criterion.label,
              description: criterion.description ?? '',
              maxScore: criterion.maxScore,
              levels: criterion.levels ?? [],
            })),
          }
        : null,
    }
  },

  /**
   * Marks it.
   *
   * `return: true` sends it back for another go rather than closing it —
   * the difference matters to the learner, who otherwise sees a grade and
   * assumes it is final.
   */
  async grade(actor, submissionId, { score, feedback = '', rubricScores = [], returnForRevision = false }) {
    const submission = await Submission.findById(submissionId)
    if (!submission) throw ApiError.notFound('Submission not found')
    if (submission.status === 'DRAFT') {
      // A draft in the grading queue would be work marked before it was
      // finished.
      throw ApiError.badRequest('That submission has not been handed in yet', 'NOT_SUBMITTED')
    }

    const assignment = await Assignment.findById(submission.assignmentId).lean()
    const max = assignment?.maxScore ?? 100

    // Derived from the rubric when there is one: a total that disagrees
    // with the criteria it is supposedly made of is the fastest way to lose
    // a learner's trust in the mark.
    const total = rubricScores.length
      ? rubricScores.reduce((sum, row) => sum + (Number(row.score) || 0), 0)
      : Number(score) || 0

    submission.score = Math.min(max, Math.max(0, total))
    submission.feedback = feedback
    submission.rubricScores = rubricScores
    submission.gradedBy = actor.id
    submission.gradedAt = new Date()
    submission.status = returnForRevision ? 'RETURNED' : 'GRADED'
    await submission.save()

    await auditLogRepository.record({
      actor: actor.id,
      action: returnForRevision ? 'ASSIGNMENT_RETURNED' : 'ASSIGNMENT_GRADED',
      entity: 'Submission',
      entityId: String(submission._id),
      metadata: { score: submission.score, max },
    })

    await notificationService
      .notify({
        userId: submission.userId,
        type: returnForRevision ? 'ASSIGNMENT_RETURNED' : 'ASSIGNMENT_GRADED',
        vars: {
          assignmentTitle: assignment?.title ?? '',
          score: `${submission.score}/${max}`,
          gradedAt: formatNotificationDate(submission.gradedAt),
        },
        relatedEntityType: 'Assignment',
        relatedEntityId: String(submission.assignmentId),
      })
      .catch((error) => logger.warn('Grading notice failed', { error: error.message }))

    return toPublicSubmission(submission.toObject())
  },
}

function toPublicAssignment(assignment) {
  return {
    id: String(assignment._id),
    topicId: String(assignment.topicId),
    courseId: String(assignment.courseId),
    title: assignment.title,
    instructions: assignment.instructions ?? '',
    submissionTypes: assignment.submissionTypes ?? ['TEXT'],
    dueAt: assignment.dueAt,
    allowLate: assignment.allowLate,
    lateWindowHours: assignment.lateWindowHours ?? 0,
    maxAttempts: assignment.maxAttempts ?? 0,
    maxScore: assignment.maxScore ?? 100,
    rubricId: assignment.rubricId ? String(assignment.rubricId) : null,
    reviewerIds: (assignment.reviewerIds ?? []).map(String),
    status: assignment.status,
    order: assignment.order ?? 0,
  }
}

function toPublicSubmission(submission) {
  return {
    id: String(submission._id),
    assignmentId: String(submission.assignmentId?._id ?? submission.assignmentId),
    userId: String(submission.userId?._id ?? submission.userId),
    attemptNo: submission.attemptNo,
    text: submission.text ?? '',
    // The storage keys are returned; a signed URL is minted per file by the
    // download endpoint, the same as every other private object.
    files: (submission.files ?? []).map((file) => ({
      key: file.key,
      name: file.name,
      size: file.size,
      mime: file.mime,
    })),
    links: submission.links ?? [],
    status: submission.status,
    submittedAt: submission.submittedAt,
    late: submission.late,
    score: submission.score,
    feedback: submission.feedback ?? '',
    rubricScores: (submission.rubricScores ?? []).map((row) => ({
      criterionId: String(row.criterionId),
      score: row.score,
      comment: row.comment ?? '',
    })),
    gradedAt: submission.gradedAt,
  }
}

export { deadlineState, toPublicAssignment, toPublicSubmission }
