import { FACE_GATE_ACTIONS, PERMISSIONS } from '@lms/shared'
import { assessmentRepository } from '../../repositories/assessment.repository.js'
import { assessmentAttemptRepository } from '../../repositories/assessmentAttempt.repository.js'
import { assessmentSessionRepository } from '../../repositories/assessmentSession.repository.js'
import { topicRepository } from '../../repositories/topic.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { computeAccessFlags } from '../courses/courseAssignmentAccess.js'
import { faceGateService } from '../face/faceGate.service.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { pointsService } from '../gamification/points.service.js'
import { openTopic, visibleRows, nextOrder } from '../courses/contentItem.js'
import { ApiError } from '../../utils/ApiError.js'
import { courseCompletionService } from '../courses/courseCompletion.service.js'
import { logger } from '../../config/logger.js'
import { canManageCourses } from '../courses/coursePermissions.js'

// A module test is a timed, single-sitting exam. Both numbers are enforced
// here rather than in the browser — see assessmentSession.model.js.
export const ASSESSMENT_TIME_LIMIT_MINUTES = 15
// The first focus loss is a warning; the second ends the sitting. Counted
// server-side so removing the client listener does not remove the rule.
export const ASSESSMENT_FOCUS_LOSS_LIMIT = 2

// isCorrect is only included for actors who can manage courses — the same
// endpoint serves both the admin test editor and the learner test-taking
// view, so learners never receive the answer key up front. Mirrors
// quiz.service.js's toPublicQuiz.
function toPublicAssessment(assessment, { includeAnswers }) {
  return {
    id: assessment._id.toString(),
    topicId: assessment.topicId.toString(),
    courseId: assessment.courseId.toString(),
    title: assessment.title,
    description: assessment.description,
    passScorePercent: assessment.passScorePercent,
    pointsEnabled: assessment.pointsEnabled,
    points: assessment.points,
    status: assessment.status,
    order: assessment.order,
    questions: assessment.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({
        id: q._id.toString(),
        text: q.text,
        order: q.order,
        options: q.options.map((o) => ({
          id: o._id.toString(),
          text: o.text,
          ...(includeAnswers ? { isCorrect: o.isCorrect } : {}),
        })),
      })),
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
  }
}

// Lighter projection for the topic content feed (listing, not taking).
function toAssessmentSummary(assessment) {
  return {
    id: assessment._id.toString(),
    topicId: assessment.topicId.toString(),
    title: assessment.title,
    questionCount: assessment.questions.length,
    passScorePercent: assessment.passScorePercent,
    pointsEnabled: assessment.pointsEnabled,
    points: assessment.points,
    status: assessment.status,
    order: assessment.order,
  }
}

// Covers the round trip of the client's own "time is up, send what we
// have" call, so a submit that left the browser in time is not thrown away
// because the network took a moment.
const SUBMIT_GRACE_MS = 10_000

function toPublicSession(session) {
  return {
    id: session._id.toString(),
    startedAt: session.startedAt,
    // The client counts down to this, not from its own clock reading — a
    // reload therefore resumes rather than restarts.
    expiresAt: session.expiresAt,
    focusLossCount: session.focusLossCount,
    status: session.status,
  }
}

// The single place a score is computed and an attempt is written, shared by
// a normal submit, a time-out and a focus-loss termination — so all three
// produce identical, comparable attempt records.
async function gradeAndRecord(actor, assessment, answers) {
  const questionById = new Map(assessment.questions.map((q) => [q._id.toString(), q]))
  const correctOptionIndexByQuestion = {}
  for (const question of assessment.questions) {
    correctOptionIndexByQuestion[question._id.toString()] = question.options.findIndex((o) => o.isCorrect)
  }

  let correctCount = 0
  for (const answer of answers) {
    if (!questionById.has(answer.questionId)) continue
    if (correctOptionIndexByQuestion[answer.questionId] === answer.selectedOptionIndex) correctCount += 1
  }

  const scorePercent = assessment.questions.length
    ? Math.round((correctCount / assessment.questions.length) * 100)
    : 0
  const passed = scorePercent >= assessment.passScorePercent

  let pointsAwarded = 0
  if (passed && assessment.pointsEnabled) {
    const awarded = await pointsService.awardForAssessment(
      actor.id,
      assessment._id.toString(),
      assessment.courseId,
      assessment.points
    )
    if (awarded.awarded) pointsAwarded = awarded.points
  }

  await assessmentAttemptRepository.create({
    userId: actor.id,
    assessmentId: assessment._id,
    courseId: assessment.courseId,
    answers: answers.map((a) => ({ questionId: a.questionId, selectedOptionIndex: a.selectedOptionIndex })),
    scorePercent,
    passed,
    pointsAwarded,
  })

  // After the attempt is stored, so the evaluation sees it. A pass can be
  // the last thing a course was waiting for, and a fail can be what stops a
  // course completing — both are the same call (3.1).
  await courseCompletionService.evaluate(actor.id, assessment.courseId).catch((error) => {
    logger.warn('Course completion evaluation failed after an assessment', {
      userId: actor.id,
      courseId: String(assessment.courseId),
      error: error.message,
    })
  })

  return {
    scorePercent,
    passed,
    pointsAwarded,
    passScorePercent: assessment.passScorePercent,
    correctOptionIndexByQuestion,
  }
}

// An abandoned sitting still counts: it is recorded as a zero-score attempt
// so that walking away with the questions open is not a way to get a fresh
// clock later.
async function closeExpiredSession(actor, assessment, session) {
  await gradeAndRecord(actor, assessment, [])
  await assessmentSessionRepository.close(session._id, { status: 'TERMINATED', endedReason: 'TIME_EXPIRED' })
}

async function assertAssignedOrStaff(actor, courseId) {
  if (canManageCourses(actor)) return
  const assignment = await courseAssignmentRepository.findByUserAndCourse(actor.id, courseId)
  const accessible = assignment ? computeAccessFlags(assignment).accessible : false
  if (!accessible) throw ApiError.forbidden('You do not have access to this course', 'COURSE_ACCESS_DENIED')
}

export const assessmentService = {
  toAssessmentSummary,

  async listByTopic(actor, topicId) {
    const { canManage } = await openTopic(actor, topicId)
    const visible = visibleRows(await assessmentRepository.listByTopic(topicId), canManage)
    // Learners get summaries only. Handing them the question text here
    // would defeat start() being the single gate on the questions — the
    // curriculum list would otherwise be a way to read the whole test
    // before the clock ever starts.
    if (!canManage) return visible.map(toAssessmentSummary)
    return visible.map((a) => toPublicAssessment(a, { includeAnswers: true }))
  },

  // Lighter than listByTopic (no questions/answers) — used by the topic
  // content feed, which is for rendering a list, not taking a test.
  async listSummariesByTopic(actor, topicId) {
    const topic = await topicRepository.findById(topicId)
    if (!topic) throw ApiError.notFound('Topic not found')
    const canManage = canManageCourses(actor)
    if (topic.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Topic not found')

    const rows = await assessmentRepository.listByTopic(topicId)
    const visible = canManage ? rows : rows.filter((a) => a.status === 'PUBLISHED')
    return visible.map(toAssessmentSummary)
  },

  // Learners get the briefing only — title, question count, pass mark,
  // time limit — never the questions themselves. Questions are handed out
  // by start() and nowhere else, so they cannot be read (or scraped) before
  // the clock is running. Managers still get the full test plus answers,
  // since this is also what the admin editor loads.
  async getById(actor, id) {
    const assessment = await assessmentRepository.findById(id)
    if (!assessment) throw ApiError.notFound('Assessment not found')
    const canManage = canManageCourses(actor)
    if (assessment.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Assessment not found')
    // The manager's shape carries the briefing figures too: the player page
    // opened as a preview drew empty tiles for the time limit and the
    // question count otherwise.
    if (canManage) {
      return {
        ...toPublicAssessment(assessment, { includeAnswers: true }),
        questionCount: assessment.questions?.length ?? 0,
        timeLimitMinutes: ASSESSMENT_TIME_LIMIT_MINUTES,
        focusLossLimit: ASSESSMENT_FOCUS_LOSS_LIMIT,
      }
    }

    const session = await assessmentSessionRepository.findActive(actor.id, id)
    const live = session && session.expiresAt > new Date() ? session : null
    return {
      ...toAssessmentSummary(assessment),
      description: assessment.description,
      courseId: assessment.courseId.toString(),
      timeLimitMinutes: ASSESSMENT_TIME_LIMIT_MINUTES,
      focusLossLimit: ASSESSMENT_FOCUS_LOSS_LIMIT,
      // Set when a sitting is already running (the page was reloaded), so
      // the client resumes the same countdown instead of offering a fresh
      // one — the whole point of stamping expiresAt server-side.
      activeSession: live ? toPublicSession(live) : null,
    }
  },

  // Opens a sitting and hands over the questions. Idempotent while a
  // sitting is live: reloading the page resumes it rather than granting
  // another 15 minutes.
  async start(actor, id) {
    const assessment = await assessmentRepository.findById(id)
    if (!assessment) throw ApiError.notFound('Assessment not found')
    if (assessment.status !== 'PUBLISHED') {
      throw ApiError.conflict('Assessment is not available yet', 'ASSESSMENT_NOT_AVAILABLE')
    }
    await assertAssignedOrStaff(actor, assessment.courseId)
    // Who is sitting the test is the whole question an exam asks, so the
    // identity check comes before the questions are handed over. Applied to a
    // resumed sitting as well as a new one: a reload is exactly when somebody
    // else could take the chair. It costs a resuming learner nothing in the
    // usual case — the daily check has already passed, and the per-open mode
    // counts a check from the last couple of minutes as current.
    await faceGateService.assertVerified(actor, FACE_GATE_ACTIONS.ASSESSMENT)

    const existing = await assessmentSessionRepository.findActive(actor.id, id)
    if (existing) {
      if (existing.expiresAt > new Date()) {
        return {
          session: toPublicSession(existing),
          assessment: toPublicAssessment(assessment, { includeAnswers: false }),
        }
      }
      // Walked away with the test open. The sitting is over and is recorded
      // as such — otherwise abandoning would be a free way to read the
      // questions, look the answers up, and come back for a fresh clock.
      await closeExpiredSession(actor, assessment, existing)
    }

    const startedAt = new Date()
    const session = await assessmentSessionRepository.create({
      userId: actor.id,
      assessmentId: assessment._id,
      courseId: assessment.courseId,
      startedAt,
      expiresAt: new Date(startedAt.getTime() + ASSESSMENT_TIME_LIMIT_MINUTES * 60_000),
    })

    return {
      session: toPublicSession(session),
      assessment: toPublicAssessment(assessment, { includeAnswers: false }),
    }
  },

  // Called by the client when the test tab loses focus. The answers filled
  // in so far come with it, so a sitting that trips the limit can be graded
  // immediately — the browser may never come back to submit them.
  async reportFocusLoss(actor, id, answers = []) {
    const assessment = await assessmentRepository.findById(id)
    if (!assessment) throw ApiError.notFound('Assessment not found')

    const session = await assessmentSessionRepository.findActive(actor.id, id)
    if (!session) throw ApiError.conflict('No test sitting is in progress', 'NO_ACTIVE_SESSION')

    const updated = await assessmentSessionRepository.incrementFocusLoss(session._id)
    if (updated.focusLossCount < ASSESSMENT_FOCUS_LOSS_LIMIT) {
      return {
        terminated: false,
        focusLossCount: updated.focusLossCount,
        focusLossLimit: ASSESSMENT_FOCUS_LOSS_LIMIT,
        result: null,
      }
    }

    const result = await gradeAndRecord(actor, assessment, answers)
    await assessmentSessionRepository.close(updated._id, { status: 'TERMINATED', endedReason: 'FOCUS_LOST' })
    return {
      terminated: true,
      focusLossCount: updated.focusLossCount,
      focusLossLimit: ASSESSMENT_FOCUS_LOSS_LIMIT,
      result: { ...result, endedReason: 'FOCUS_LOST' },
    }
  },

  async create(actor, topicId, payload) {
    const topic = await topicRepository.findById(topicId)
    if (!topic) throw ApiError.notFound('Topic not found')

    const assessment = await assessmentRepository.create({
      topicId,
      courseId: topic.courseId,
      title: payload.title,
      // Shared across all four content types (9.1) — see material.service.
      order: payload.order ?? (await nextOrder(topicId)),
      createdBy: actor.id,
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'ASSESSMENT_CREATED',
      entity: 'Assessment',
      entityId: assessment._id.toString(),
    })
    return toPublicAssessment(assessment, { includeAnswers: true })
  },

  async update(actor, id, payload) {
    const existing = await assessmentRepository.findById(id)
    if (!existing) throw ApiError.notFound('Assessment not found')

    const updated = await assessmentRepository.updateById(id, { ...payload, updatedBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ASSESSMENT_UPDATED',
      entity: 'Assessment',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublicAssessment(updated, { includeAnswers: true })
  },

  async remove(actor, id) {
    const existing = await assessmentRepository.findById(id)
    if (!existing) throw ApiError.notFound('Assessment not found')
    await assessmentRepository.deleteById(id)
    await auditLogRepository.record({ actor: actor.id, action: 'ASSESSMENT_DELETED', entity: 'Assessment', entityId: id })
  },

  async submit(actor, id, answers) {
    const assessment = await assessmentRepository.findById(id)
    if (!assessment) throw ApiError.notFound('Assessment not found')
    if (assessment.status !== 'PUBLISHED') {
      throw ApiError.conflict('Assessment is not available yet', 'ASSESSMENT_NOT_AVAILABLE')
    }

    // Unlike Quiz, which gets a course-assignment check for free as a side
    // effect of requiring video completion, Assessment has no such proxy —
    // this check is the only thing standing between "authenticated" and
    // "actually assigned to this course".
    await assertAssignedOrStaff(actor, assessment.courseId)

    // A submit without a sitting means the client never called start() —
    // i.e. it never received the questions from us. Refuse rather than
    // grade, or the timer becomes optional.
    const session = await assessmentSessionRepository.findActive(actor.id, id)
    if (!session) {
      throw ApiError.conflict('Start the test before submitting', 'NO_ACTIVE_SESSION')
    }

    // Late submissions are still graded (the agreed rule is "auto-submit
    // what was answered"), but they are recorded as time-expired and the
    // grace window is small enough that it only covers the round trip of
    // the client's own auto-submit.
    const now = new Date()
    const expired = now > new Date(session.expiresAt.getTime() + SUBMIT_GRACE_MS)
    const result = await gradeAndRecord(actor, assessment, expired ? [] : answers)

    await assessmentSessionRepository.close(session._id, {
      status: 'SUBMITTED',
      endedReason: now > session.expiresAt ? 'TIME_EXPIRED' : '',
    })

    return { ...result, endedReason: now > session.expiresAt ? 'TIME_EXPIRED' : '' }
  },
}
