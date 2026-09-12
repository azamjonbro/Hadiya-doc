import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { clientErrorsRouter } from './clientErrors.routes.js'
import { authRouter } from './auth.routes.js'
import { usersRouter } from './users.routes.js'
import { groupsRouter } from './groups.routes.js'
import { coursesRouter } from './courses.routes.js'
import { topicsRouter } from './topics.routes.js'
import { assignmentsRouter } from './assignments.routes.js'
import { videosRouter } from './videos.routes.js'
import { videoAccessRouter } from './videoAccess.routes.js'
import { videoStreamRouter } from './videoStream.routes.js'
import { materialsRouter } from './materials.routes.js'
import { lessonsRouter } from './lessons.routes.js'
import { scormRouter } from './scorm.routes.js'
import { trashRouter } from './trash.routes.js'
import { assessmentsRouter } from './assessments.routes.js'
import { analyticsRouter } from './analytics.routes.js'
import { videoAnalyticsRouter } from './videoAnalytics.routes.js'
import { newsRouter } from './news.routes.js'
import { newsAnalyticsRouter } from './newsAnalytics.routes.js'
import { tasksRouter } from './tasks.routes.js'
import { eventsRouter } from './events.routes.js'
import { notificationsRouter } from './notifications.routes.js'
import { pushRouter } from './push.routes.js'
import { orgRouter } from './org.routes.js'
import { aiChatRouter } from './aiChat.routes.js'
import { dashboardRouter } from './dashboard.routes.js'
import { branchesRouter } from './branches.routes.js'
import { rolesRouter } from './roles.routes.js'
import { orgListsRouter } from './orgLists.routes.js'
import { proctorRouter } from './proctor.routes.js'
import { reportsRouter } from './reports.routes.js'
import { auditRouter } from './audit.routes.js'
import { uploadsRouter } from './uploads.routes.js'
import { gamificationRouter } from './gamification.routes.js'
import { chatRouter } from './chat.routes.js'
import { attentionPolicyRouter } from './attentionPolicy.routes.js'
import { facePolicyRouter } from './facePolicy.routes.js'
import { certificatesRouter, publicCertificatesRouter } from './certificates.routes.js'
import { testQuizzesRouter } from './testQuizzes.routes.js'
import { questionsRouter } from './questions.routes.js'
import { pathsRouter } from './paths.routes.js'
import { enrollmentRulesRouter } from './enrollmentRules.routes.js'
import { onboardingRouter } from './onboarding.routes.js'
import { calendarRouter } from './calendar.routes.js'
import { homeworkRouter } from './homework.routes.js'
import { kbRouter } from './kb.routes.js'
import { searchRouter } from './search.routes.js'
import { complianceRouter } from './compliance.routes.js'
import { settingsRouter } from './settings.routes.js'
import { mediaRouter } from './media.routes.js'
import { aiGenerationRouter } from './aiGeneration.routes.js'
import { apiKeysRouter } from './apiKeys.routes.js'
import { webhooksRouter } from './webhooks.routes.js'
import { competenciesRouter } from './competencies.routes.js'
import { review360Router } from './review360.routes.js'
import { ojtRouter } from './ojt.routes.js'
import { developmentPlansRouter } from './developmentPlans.routes.js'

export const v1Router = Router()

// Public first, and deliberately at its own prefix: /public/* is the only
// part of the API that answers without a token, and keeping it visible in
// one place is what makes "which endpoints are unauthenticated" a question
// with a readable answer.
v1Router.use('/public/certificates', publicCertificatesRouter)

v1Router.use('/health', healthRouter)
v1Router.use('/client-errors', clientErrorsRouter)
v1Router.use('/auth', authRouter)
v1Router.use('/users', usersRouter)
v1Router.use('/groups', groupsRouter)
v1Router.use('/courses', coursesRouter)
v1Router.use('/topics', topicsRouter)
v1Router.use('/assignments', assignmentsRouter)
v1Router.use('/videos', videosRouter)
v1Router.use('/video-access', videoAccessRouter)
v1Router.use('/video-stream', videoStreamRouter)
v1Router.use('/materials', materialsRouter)
// Text lessons — the fourth kind of content a topic can hold (9.1).
v1Router.use('/lessons', lessonsRouter)
// SCORM packages — the fifth (9.3). Part of this router answers without a
// bearer token, authorised by a launch token in the path instead: see
// scorm.routes.js.
v1Router.use('/scorm', scormRouter)
v1Router.use('/trash', trashRouter)
v1Router.use('/assessments', assessmentsRouter)
v1Router.use('/analytics', analyticsRouter)
v1Router.use('/video-analytics', videoAnalyticsRouter)
v1Router.use('/news', newsRouter)
v1Router.use('/news-analytics', newsAnalyticsRouter)
v1Router.use('/tasks', tasksRouter)
v1Router.use('/events', eventsRouter)
v1Router.use('/notifications', notificationsRouter)
v1Router.use('/push', pushRouter)
v1Router.use('/org', orgRouter)
v1Router.use('/ai-chat', aiChatRouter)
v1Router.use('/dashboard', dashboardRouter)
v1Router.use('/branches', branchesRouter)
v1Router.use('/roles', rolesRouter)
v1Router.use('/org-lists', orgListsRouter)
v1Router.use('/proctor', proctorRouter)
v1Router.use('/reports', reportsRouter)
v1Router.use('/audit-logs', auditRouter)
v1Router.use('/uploads', uploadsRouter)
v1Router.use('/gamification', gamificationRouter)
v1Router.use('/chat', chatRouter)
v1Router.use('/attention-policy', attentionPolicyRouter)
v1Router.use('/face-policy', facePolicyRouter)
v1Router.use('/certificates', certificatesRouter)
// The unified test (4.2). The legacy video-quiz and assessment routes stay
// exactly where they are until the frontend has moved over (AT-09).
v1Router.use('/quizzes', testQuizzesRouter)
v1Router.use('/questions', questionsRouter)
v1Router.use('/paths', pathsRouter)
v1Router.use('/enrollment-rules', enrollmentRulesRouter)
v1Router.use('/onboarding', onboardingRouter)
v1Router.use('/calendar', calendarRouter)
// Homework. `/assignments` is already course-to-person assignment, so this
// takes its own prefix rather than overloading that one.
v1Router.use('/homework', homeworkRouter)
v1Router.use('/kb', kbRouter)
v1Router.use('/search', searchRouter)
v1Router.use('/compliance', complianceRouter)
v1Router.use('/settings', settingsRouter)
// The media library and the orphan sweep (9.5).
v1Router.use('/media', mediaRouter)
// AI generation jobs (BLOK 10). `/ai-chat` above is the learner's
// assistant; this is the authoring side.
v1Router.use('/ai', aiGenerationRouter)
// Managing the keys that open /api/public/v1 (11.1).
v1Router.use('/api-keys', apiKeysRouter)
v1Router.use('/webhooks', webhooksRouter)

// BLOK 13 — kengaytirilgan baholash. Kurs "nimani o'tdi" ni aytadi, bu
// to'rttasi esa "nimani qila oladi" ni: kompetensiya katalogi va daraja
// (13.1), 360° sikl (13.2), ish o'rnidagi kuzatuv (13.3) va shundan
// o'sadigan rivojlanish rejasi (13.4).
v1Router.use('/competencies', competenciesRouter)
v1Router.use('/review360', review360Router)
v1Router.use('/ojt', ojtRouter)
v1Router.use('/development-plans', developmentPlansRouter)
