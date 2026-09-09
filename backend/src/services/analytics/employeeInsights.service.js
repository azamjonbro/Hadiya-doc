import { userService } from '../users/user.service.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { videoRepository } from '../../repositories/video.repository.js'
import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { videoSessionRepository } from '../../repositories/videoSession.repository.js'
import { quizRepository } from '../../repositories/quiz.repository.js'
import { quizAttemptRepository } from '../../repositories/quizAttempt.repository.js'
import { assessmentRepository } from '../../repositories/assessment.repository.js'
import { assessmentAttemptRepository } from '../../repositories/assessmentAttempt.repository.js'
import { taskRepository } from '../../repositories/task.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { learningStatsService } from './learningStats.service.js'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DEFAULT_RANGE_DAYS = 30

// Effort is scored against targets rather than against other employees, so a
// score means the same thing in a team of three and a team of three hundred.
// Tune these and every effort score moves with them.
const EFFORT_TARGETS = {
  activeDaysPerMonth: 20,
  watchHoursPerMonth: 10,
  streakDays: 7,
}

const LEVEL_THRESHOLDS = [
  { min: 85, level: 'EXCELLENT' },
  { min: 70, level: 'GOOD' },
  { min: 50, level: 'AVERAGE' },
  { min: 0, level: 'BEGINNER' },
]

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function ratioScore(value, target) {
  if (!target) return null
  return clampPercent((value / target) * 100)
}

function average(numbers) {
  if (!numbers.length) return null
  return Math.round(numbers.reduce((sum, n) => sum + n, 0) / numbers.length)
}

function levelFor(score) {
  if (score === null) return 'NO_DATA'
  return LEVEL_THRESHOLDS.find((t) => score >= t.min).level
}

// Components with no data at all (no tests taken, no tasks assigned) are
// dropped and the remaining weights re-normalised, so a brand-new employee
// isn't scored down for data that doesn't exist yet.
function weightedScore(components) {
  const usable = components.filter((c) => c.score !== null)
  const totalWeight = usable.reduce((sum, c) => sum + c.weight, 0)
  if (!totalWeight) return null
  return Math.round(usable.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight)
}

async function assertCanView(actor, targetUserId) {
  // Reuses the user lookup's manager/department scoping rather than
  // re-implementing it — the route already gated on self-or-user:read.
  return userService.getById(actor, targetUserId)
}

function toIdString(value) {
  return value ? value.toString() : ''
}

// Shared shape for a quiz attempt and an assessment attempt: both embed the
// same {questionId, selectedOptionIndex} answers against the same embedded
// question/option documents, so one grader serves both.
function gradeAnswers(attempt, questions) {
  const questionById = new Map(questions.map((q) => [q._id.toString(), q]))
  return attempt.answers.map((answer) => {
    const question = questionById.get(answer.questionId.toString())
    const selectedOption = question?.options[answer.selectedOptionIndex]
    const correctOption = question?.options.find((o) => o.isCorrect)
    return {
      questionId: answer.questionId.toString(),
      questionText: question?.text ?? '',
      selectedOptionText: selectedOption?.text ?? '',
      correctOptionText: correctOption?.text ?? '',
      isCorrect: Boolean(selectedOption?.isCorrect),
    }
  })
}

function buildAttemptView(attempt, questions) {
  return {
    id: attempt._id.toString(),
    scorePercent: attempt.scorePercent,
    passed: attempt.passed,
    pointsAwarded: attempt.pointsAwarded,
    createdAt: attempt.createdAt,
    answers: gradeAnswers(attempt, questions),
  }
}

export const employeeInsightsService = {
  // "O'rganish darajasi" / "harakat darajasi" — two separate scores, because
  // an employee can be diligent (watches every day) while still scoring badly
  // on tests, and the manager needs to tell those two cases apart.
  async getPerformance(actor, targetUserId) {
    const user = await assertCanView(actor, targetUserId)

    const [assignments, progressRows, quizAttempts, assessmentAttempts, tasks, stats, activity] = await Promise.all([
      courseAssignmentRepository.listByUser(targetUserId),
      videoProgressRepository.listByUser(targetUserId),
      quizAttemptRepository.listByUser(targetUserId),
      assessmentAttemptRepository.listByUser(targetUserId),
      taskRepository.listAllByAssignee(targetUserId),
      learningStatsService.getForUser(targetUserId),
      videoSessionRepository.aggregateDailyActivity(targetUserId, new Date(Date.now() - DEFAULT_RANGE_DAYS * DAY_MS)),
    ])

    // ---- learning level -------------------------------------------------
    // One query for every assigned course's videos, not one per course: an
    // employee with thirty assignments used to fire thirty parallel finds,
    // and this endpoint is opened by a manager for one report subject at a
    // time — the cost is paid on every page view.
    const courseIds = assignments.map((a) => a.courseId.toString())
    const assignedVideos = (await videoRepository.listByCourses(courseIds)).filter(
      (v) => v.status === 'PUBLISHED'
    )
    const completedVideoIds = new Set(
      progressRows.filter((p) => p.completedAt).map((p) => p.videoId.toString())
    )
    const completedAssignedVideos = assignedVideos.filter((v) => completedVideoIds.has(v._id.toString())).length

    const courseScore = assignments.length
      ? clampPercent((assignments.filter((a) => a.status === 'COMPLETED').length / assignments.length) * 100)
      : null
    const videoScore = assignedVideos.length
      ? clampPercent((completedAssignedVideos / assignedVideos.length) * 100)
      : null

    // Best score per test, not per attempt — retaking until you pass is the
    // behaviour we want to encourage, so it shouldn't drag the average down.
    const bestByTest = new Map()
    for (const attempt of [...quizAttempts, ...assessmentAttempts]) {
      const key = toIdString(attempt.quizId ?? attempt.assessmentId)
      bestByTest.set(key, Math.max(bestByTest.get(key) ?? 0, attempt.scorePercent))
    }
    const testScore = average([...bestByTest.values()])

    const learningComponents = [
      { key: 'courseCompletion', weight: 35, score: courseScore },
      { key: 'videoCompletion', weight: 30, score: videoScore },
      { key: 'testScore', weight: 35, score: testScore },
    ]
    const learningScore = weightedScore(learningComponents)

    // ---- effort level ---------------------------------------------------
    const activeDays = activity.length
    const watchHours = activity.reduce((sum, d) => sum + d.watchedSeconds, 0) / 3600
    const resolvedTasks = tasks.filter((t) => t.status === 'COMPLETED')
    const onTimeTasks = resolvedTasks.filter((t) => !t.deadline || (t.completedAt && t.completedAt <= t.deadline))
    const timelinessBase = resolvedTasks.length + tasks.filter(
      (t) => ['TODO', 'IN_PROGRESS'].includes(t.status) && t.deadline && t.deadline < new Date()
    ).length

    const effortComponents = [
      { key: 'consistency', weight: 30, score: ratioScore(activeDays, EFFORT_TARGETS.activeDaysPerMonth) },
      { key: 'volume', weight: 25, score: ratioScore(watchHours, EFFORT_TARGETS.watchHoursPerMonth) },
      { key: 'streak', weight: 15, score: ratioScore(stats.streakDays, EFFORT_TARGETS.streakDays) },
      {
        key: 'taskTimeliness',
        weight: 30,
        score: timelinessBase ? clampPercent((onTimeTasks.length / timelinessBase) * 100) : null,
      },
    ]
    const effortScore = weightedScore(effortComponents)

    return {
      userId: user.id,
      rangeDays: DEFAULT_RANGE_DAYS,
      learning: {
        score: learningScore,
        level: levelFor(learningScore),
        components: learningComponents,
      },
      effort: {
        score: effortScore,
        level: levelFor(effortScore),
        components: effortComponents,
      },
      highlights: {
        coursesAssigned: assignments.length,
        coursesCompleted: assignments.filter((a) => a.status === 'COMPLETED').length,
        videosCompleted: completedAssignedVideos,
        videosAssigned: assignedVideos.length,
        testsTaken: bestByTest.size,
        averageTestScore: testScore,
        hoursLearned: stats.hoursLearned,
        streakDays: stats.streakDays,
        activeDays,
        tasksTotal: tasks.length,
        tasksCompleted: resolvedTasks.length,
      },
    }
  },

  // "Qaysi kuni ko'p ishladi, qaysi kuni oz" — a zero-filled daily series
  // plus the weekday rollup, so both the calendar answer and the habit
  // answer ("always quiet on Fridays") come from one call.
  async getActivity(actor, targetUserId, { days = DEFAULT_RANGE_DAYS } = {}) {
    await assertCanView(actor, targetUserId)

    const since = new Date(Date.now() - (days - 1) * DAY_MS)
    since.setUTCHours(0, 0, 0, 0)
    const rows = await videoSessionRepository.aggregateDailyActivity(targetUserId, since)
    const byDate = new Map(rows.map((r) => [r.date, r]))

    const series = []
    for (let i = 0; i < days; i += 1) {
      const date = new Date(since.getTime() + i * DAY_MS)
      const key = dayKey(date)
      const row = byDate.get(key)
      series.push({
        date: key,
        weekday: date.getUTCDay(),
        watchedSeconds: row?.watchedSeconds ?? 0,
        activeSeconds: row?.activeSeconds ?? 0,
        sessions: row?.sessions ?? 0,
        videos: row?.videos ?? 0,
      })
    }

    const activeDays = series.filter((d) => d.watchedSeconds > 0)
    const totalWatchedSeconds = series.reduce((sum, d) => sum + d.watchedSeconds, 0)

    // The quietest day is picked from days they actually studied — an
    // untouched day is an absence, not a "low effort day", and mixing the two
    // would make every employee's quietest day read as zero.
    const sortedActive = [...activeDays].sort((a, b) => b.watchedSeconds - a.watchedSeconds)

    const weekdays = Array.from({ length: 7 }, (_, weekday) => {
      const dayRows = series.filter((d) => d.weekday === weekday)
      const active = dayRows.filter((d) => d.watchedSeconds > 0)
      return {
        weekday,
        watchedSeconds: dayRows.reduce((sum, d) => sum + d.watchedSeconds, 0),
        sessions: dayRows.reduce((sum, d) => sum + d.sessions, 0),
        activeDays: active.length,
        totalDays: dayRows.length,
      }
    })
    const rankedWeekdays = weekdays.filter((w) => w.watchedSeconds > 0).sort((a, b) => b.watchedSeconds - a.watchedSeconds)

    return {
      rangeDays: days,
      from: dayKey(since),
      to: dayKey(new Date()),
      days: series,
      totals: {
        watchedSeconds: totalWatchedSeconds,
        sessions: series.reduce((sum, d) => sum + d.sessions, 0),
        activeDays: activeDays.length,
        averageSecondsPerActiveDay: activeDays.length ? Math.round(totalWatchedSeconds / activeDays.length) : 0,
      },
      bestDay: sortedActive[0] ?? null,
      quietestDay: sortedActive.length > 1 ? sortedActive[sortedActive.length - 1] : null,
      weekdays,
      busiestWeekday: rankedWeekdays[0] ?? null,
      quietestWeekday: rankedWeekdays.length > 1 ? rankedWeekdays[rankedWeekdays.length - 1] : null,
    }
  },

  // Every test the employee has taken — video quizzes and standalone
  // assessments in one list — down to the individual wrong answer, plus a
  // "weak questions" rollup answering "qaysi testni qayerida xato qildi".
  async getTestResults(actor, targetUserId) {
    await assertCanView(actor, targetUserId)

    const [quizAttempts, assessmentAttempts] = await Promise.all([
      quizAttemptRepository.listByUser(targetUserId),
      assessmentAttemptRepository.listByUser(targetUserId),
    ])

    const quizIds = [...new Set(quizAttempts.map((a) => a.quizId.toString()))]
    const assessmentIds = [...new Set(assessmentAttempts.map((a) => a.assessmentId.toString()))]
    const courseIds = [
      ...new Set([...quizAttempts, ...assessmentAttempts].map((a) => a.courseId.toString())),
    ]
    const videoIds = [...new Set(quizAttempts.map((a) => a.videoId.toString()))]

    const [quizzes, assessments, courses, videos] = await Promise.all([
      quizIds.length ? quizRepository.findByIds(quizIds) : [],
      assessmentIds.length ? assessmentRepository.findByIds(assessmentIds) : [],
      courseIds.length ? courseRepository.findByIds(courseIds) : [],
      videoIds.length ? videoRepository.findByIds(videoIds) : [],
    ])

    const quizById = new Map(quizzes.map((q) => [q._id.toString(), q]))
    const assessmentById = new Map(assessments.map((a) => [a._id.toString(), a]))
    const courseTitleById = new Map(courses.map((c) => [c._id.toString(), c.title]))
    const videoTitleById = new Map(videos.map((v) => [v._id.toString(), v.title]))

    const tests = new Map()

    function testEntry(key, base) {
      if (!tests.has(key)) tests.set(key, { ...base, attempts: [] })
      return tests.get(key)
    }

    for (const attempt of quizAttempts) {
      const quizId = attempt.quizId.toString()
      const quiz = quizById.get(quizId)
      // A deleted quiz leaves its attempts behind; show the score history
      // rather than dropping the test from the employee's record.
      const entry = testEntry(`quiz:${quizId}`, {
        kind: 'QUIZ',
        testId: quizId,
        videoId: attempt.videoId.toString(),
        title: videoTitleById.get(attempt.videoId.toString()) ?? '',
        courseId: attempt.courseId.toString(),
        courseTitle: courseTitleById.get(attempt.courseId.toString()) ?? '',
        passScorePercent: quiz?.passScorePercent ?? null,
        questionCount: quiz?.questions.length ?? 0,
      })
      entry.attempts.push(buildAttemptView(attempt, quiz?.questions ?? []))
    }

    for (const attempt of assessmentAttempts) {
      const assessmentId = attempt.assessmentId.toString()
      const assessment = assessmentById.get(assessmentId)
      const entry = testEntry(`assessment:${assessmentId}`, {
        kind: 'ASSESSMENT',
        testId: assessmentId,
        videoId: null,
        title: assessment?.title ?? '',
        courseId: attempt.courseId.toString(),
        courseTitle: courseTitleById.get(attempt.courseId.toString()) ?? '',
        passScorePercent: assessment?.passScorePercent ?? null,
        questionCount: assessment?.questions.length ?? 0,
      })
      entry.attempts.push(buildAttemptView(attempt, assessment?.questions ?? []))
    }

    const items = [...tests.values()].map((test) => {
      const attempts = test.attempts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      const scores = attempts.map((a) => a.scorePercent)
      const last = attempts[0]
      const first = attempts[attempts.length - 1]
      return {
        ...test,
        attemptsCount: attempts.length,
        bestScore: Math.max(...scores),
        lastScore: last.scorePercent,
        passed: attempts.some((a) => a.passed),
        passedFirstTry: first.passed,
        lastAttemptAt: last.createdAt,
        wrongAnswers: last.answers.filter((a) => !a.isCorrect).length,
        attempts,
      }
    })
    items.sort((a, b) => new Date(b.lastAttemptAt) - new Date(a.lastAttemptAt))

    // Questions the employee keeps getting wrong, across every attempt —
    // this is the "where exactly did they go wrong" list a manager acts on.
    const weakByQuestion = new Map()
    for (const test of items) {
      for (const attempt of test.attempts) {
        for (const answer of attempt.answers) {
          const key = `${test.testId}:${answer.questionId}`
          const row = weakByQuestion.get(key) ?? {
            testId: test.testId,
            testTitle: test.title,
            courseTitle: test.courseTitle,
            questionText: answer.questionText,
            correctOptionText: answer.correctOptionText,
            wrongCount: 0,
            totalCount: 0,
          }
          row.totalCount += 1
          if (!answer.isCorrect) row.wrongCount += 1
          weakByQuestion.set(key, row)
        }
      }
    }
    const weakQuestions = [...weakByQuestion.values()]
      .filter((row) => row.wrongCount > 0)
      .sort((a, b) => b.wrongCount - a.wrongCount || b.totalCount - a.totalCount)

    const allAttempts = items.flatMap((t) => t.attempts)
    const bestScores = items.map((t) => t.bestScore)

    return {
      summary: {
        testsTaken: items.length,
        totalAttempts: allAttempts.length,
        quizzesTaken: items.filter((t) => t.kind === 'QUIZ').length,
        assessmentsTaken: items.filter((t) => t.kind === 'ASSESSMENT').length,
        passedTests: items.filter((t) => t.passed).length,
        failedTests: items.filter((t) => !t.passed).length,
        firstTryPassRate: items.length
          ? clampPercent((items.filter((t) => t.passedFirstTry).length / items.length) * 100)
          : null,
        averageScore: average(bestScores),
        bestScore: bestScores.length ? Math.max(...bestScores) : null,
        worstScore: bestScores.length ? Math.min(...bestScores) : null,
        wrongAnswers: allAttempts.reduce((sum, a) => sum + a.answers.filter((x) => !x.isCorrect).length, 0),
      },
      tests: items,
      weakQuestions,
    }
  },

  // "Qaysi task biriktirilgan, qanchada tayyorladi" — every task with its
  // turnaround time measured from assignment to completion.
  async getTasks(actor, targetUserId) {
    await assertCanView(actor, targetUserId)

    const tasks = await taskRepository.listAllByAssignee(targetUserId)
    const assignerIds = [...new Set(tasks.map((t) => t.assignedBy.toString()))]
    const assigners = assignerIds.length ? await userRepository.findByIds(assignerIds) : []
    const assignerNameById = new Map(assigners.map((u) => [u._id.toString(), u.fullName]))

    const now = new Date()
    const items = tasks.map((task) => {
      const isOverdue = Boolean(
        ['TODO', 'IN_PROGRESS'].includes(task.status) && task.deadline && now > task.deadline
      )
      const completionHours = task.completedAt
        ? Math.round(((task.completedAt - task.createdAt) / HOUR_MS) * 10) / 10
        : null
      return {
        id: task._id.toString(),
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        effectiveStatus: isOverdue ? 'OVERDUE' : task.status,
        deadline: task.deadline,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        assignedByName: assignerNameById.get(task.assignedBy.toString()) ?? '',
        completionHours,
        // null when the task has no deadline — "on time" is meaningless then,
        // and counting it as a win would inflate the timeliness rate.
        onTime: task.completedAt && task.deadline ? task.completedAt <= task.deadline : null,
      }
    })

    const completed = items.filter((t) => t.status === 'COMPLETED')
    const withDeadline = completed.filter((t) => t.onTime !== null)
    const durations = completed.filter((t) => t.completionHours !== null)
    const sortedByDuration = [...durations].sort((a, b) => a.completionHours - b.completionHours)

    const byStatus = { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 }
    for (const task of items) byStatus[task.status] += 1

    return {
      summary: {
        total: items.length,
        byStatus,
        overdue: items.filter((t) => t.effectiveStatus === 'OVERDUE').length,
        completedOnTime: withDeadline.filter((t) => t.onTime).length,
        completedLate: withDeadline.filter((t) => !t.onTime).length,
        onTimeRate: withDeadline.length
          ? clampPercent((withDeadline.filter((t) => t.onTime).length / withDeadline.length) * 100)
          : null,
        averageCompletionHours: durations.length
          ? Math.round((durations.reduce((sum, t) => sum + t.completionHours, 0) / durations.length) * 10) / 10
          : null,
        fastest: sortedByDuration[0] ?? null,
        slowest: sortedByDuration.length > 1 ? sortedByDuration[sortedByDuration.length - 1] : null,
      },
      items,
    }
  },
}
